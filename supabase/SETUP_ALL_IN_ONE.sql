-- ============================================================================
-- Coupon & Gift Card Vault â€” Supabase Auth, RBAC & Column/Row-Level Security
-- Follows Supabase Postgres Best Practices:
--   1. Dedicated `private` schema for SECURITY DEFINER role lookup functions
--   2. Wrap `auth.uid()` in `(select auth.uid())` for cached per-query plans
--   3. Separate `public.coupon_secrets` table so secret coupon codes are
--      protected by Postgres RLS (never sent over the wire to unauthorized users)
--   4. Explicit `TO authenticated` clauses (never deprecated `auth.role()`)
--   5. Both `USING` and `WITH CHECK` on all `UPDATE` policies
-- ============================================================================

-- 1. Create non-exposed `private` schema for authorization helper functions
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- 2. Profiles table (stores role & code-read permission controlled ONLY by Super Admin)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null,
  role text not null default 'viewer' check (role in ('super_admin', 'contributor', 'viewer')),
  can_read_codes boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles (role);

-- 3. Coupons metadata table (safe for all authenticated friends to search & view balances)
create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  store text not null,
  account text not null,
  benefit_type text not null default 'Gift Card / Wallet',
  amount numeric(12, 2) not null default 0 check (amount >= 0),
  initial_amount numeric(12, 2) not null default 0,
  expiry date not null,
  notes text default '',
  status text not null default 'active' check (status in ('active', 'used')),
  admin_only_code boolean not null default false,
  has_secret_code boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists coupons_store_idx on public.coupons (lower(store));
create index if not exists coupons_expiry_idx on public.coupons (expiry);
create index if not exists coupons_status_idx on public.coupons (status);
create index if not exists coupons_created_by_idx on public.coupons (created_by);

-- 4. Coupon Secrets table (strictly gated by RLS: only returned if user has `can_read_codes` or is `super_admin`)
create table if not exists public.coupon_secrets (
  coupon_id uuid primary key references public.coupons(id) on delete cascade,
  secret_code text not null,
  updated_at timestamptz not null default now()
);

-- 5. Activity Logger table
create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  title text not null,
  detail text default '',
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text default 'Member',
  created_at timestamptz not null default now()
);

create index if not exists activity_logs_created_at_idx on public.activity_logs (created_at desc);
create index if not exists activity_logs_actor_id_idx on public.activity_logs (actor_id);

-- ============================================================================
-- Helper Functions in `private` schema (SECURITY DEFINER with search_path = '')
-- ============================================================================

create or replace function private.get_my_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.profiles
  where id = (select auth.uid());
$$;

create or replace function private.can_i_read_codes()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select (role = 'super_admin' or can_read_codes = true)
     from public.profiles
     where id = (select auth.uid())),
    false
  );
$$;

revoke execute on function private.get_my_role() from public, anon;
grant execute on function private.get_my_role() to authenticated;

revoke execute on function private.can_i_read_codes() from public, anon;
grant execute on function private.can_i_read_codes() to authenticated;

-- ============================================================================
-- Auto-create Profile on Signup (First user becomes Super Admin automatically!)
-- ============================================================================

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  is_first_user boolean;
begin
  select not exists (select 1 from public.profiles) into is_first_user;

  insert into public.profiles (id, email, display_name, role, can_read_codes)
  values (
    new.id,
    coalesce(new.email, 'user@vault.local'),
    coalesce(new.raw_user_meta_data->>'display_name', split_part(coalesce(new.email, 'Friend'), '@', 1)),
    case when is_first_user then 'super_admin' else 'viewer' end,
    case when is_first_user then true else false end
  );
  return new;
end;
$$;

revoke execute on function private.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ============================================================================
-- Enable Row-Level Security (RLS) & Table Grants
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.coupons enable row level security;
alter table public.coupon_secrets enable row level security;
alter table public.activity_logs enable row level security;

grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.coupons to authenticated;
grant select, insert, update, delete on public.coupon_secrets to authenticated;
grant select, insert, delete on public.activity_logs to authenticated;

-- 1. Policies for `public.profiles`
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
  on public.profiles for select
  to authenticated
  using ( (select auth.uid()) is not null );

-- Only Super Admin can update roles and `can_read_codes` permissions
drop policy if exists "profiles_update_super_admin_only" on public.profiles;
create policy "profiles_update_super_admin_only"
  on public.profiles for update
  to authenticated
  using ( (select private.get_my_role()) = 'super_admin' )
  with check ( (select private.get_my_role()) = 'super_admin' );

-- 2. Policies for `public.coupons`
-- All signed-in friends (viewer, contributor, super_admin) can view store balances & accounts
drop policy if exists "coupons_select_all_members" on public.coupons;
create policy "coupons_select_all_members"
  on public.coupons for select
  to authenticated
  using ( (select private.get_my_role()) in ('super_admin', 'contributor', 'viewer') );

-- Only Super Admin and Contributors can add coupons
drop policy if exists "coupons_insert_contributors_and_admin" on public.coupons;
create policy "coupons_insert_contributors_and_admin"
  on public.coupons for insert
  to authenticated
  with check ( (select private.get_my_role()) in ('super_admin', 'contributor') );

-- Only Super Admin and Contributors can update balances
drop policy if exists "coupons_update_contributors_and_admin" on public.coupons;
create policy "coupons_update_contributors_and_admin"
  on public.coupons for update
  to authenticated
  using ( (select private.get_my_role()) in ('super_admin', 'contributor') )
  with check ( (select private.get_my_role()) in ('super_admin', 'contributor') );

-- Only Super Admin can delete coupons
drop policy if exists "coupons_delete_super_admin_only" on public.coupons;
create policy "coupons_delete_super_admin_only"
  on public.coupons for delete
  to authenticated
  using ( (select private.get_my_role()) = 'super_admin' );

-- 3. Policies for `public.coupon_secrets` (THE CODE VISIBILITY GATE!)
-- Secret coupon codes are ONLY readable if:
--   a) The user is `super_admin`, OR
--   b) The user has `can_read_codes = true` AND the coupon is not flagged `admin_only_code`
drop policy if exists "coupon_secrets_select_authorized_only" on public.coupon_secrets;
create policy "coupon_secrets_select_authorized_only"
  on public.coupon_secrets for select
  to authenticated
  using (
    (select private.get_my_role()) = 'super_admin'
    or (
      (select private.can_i_read_codes()) = true
      and exists (
        select 1 from public.coupons c
        where c.id = coupon_secrets.coupon_id
          and c.admin_only_code = false
      )
    )
  );

drop policy if exists "coupon_secrets_insert_contributors_and_admin" on public.coupon_secrets;
create policy "coupon_secrets_insert_contributors_and_admin"
  on public.coupon_secrets for insert
  to authenticated
  with check ( (select private.get_my_role()) in ('super_admin', 'contributor') );

drop policy if exists "coupon_secrets_update_contributors_and_admin" on public.coupon_secrets;
create policy "coupon_secrets_update_contributors_and_admin"
  on public.coupon_secrets for update
  to authenticated
  using ( (select private.get_my_role()) in ('super_admin', 'contributor') )
  with check ( (select private.get_my_role()) in ('super_admin', 'contributor') );

drop policy if exists "coupon_secrets_delete_super_admin_only" on public.coupon_secrets;
create policy "coupon_secrets_delete_super_admin_only"
  on public.coupon_secrets for delete
  to authenticated
  using ( (select private.get_my_role()) = 'super_admin' );

-- 4. Policies for `public.activity_logs`
drop policy if exists "activity_logs_select_all_members" on public.activity_logs;
drop policy if exists "activity_logs_select_super_admin_only" on public.activity_logs;
create policy "activity_logs_select_super_admin_only"
  on public.activity_logs for select
  to authenticated
  using ( (select private.get_my_role()) = 'super_admin' );

drop policy if exists "activity_logs_insert_contributors_and_admin" on public.activity_logs;
create policy "activity_logs_insert_contributors_and_admin"
  on public.activity_logs for insert
  to authenticated
  with check ( (select private.get_my_role()) in ('super_admin', 'contributor') );

drop policy if exists "activity_logs_delete_super_admin_only" on public.activity_logs;
create policy "activity_logs_delete_super_admin_only"
  on public.activity_logs for delete
  to authenticated
  using ( (select private.get_my_role()) = 'super_admin' );


-- ============================================================================
-- Coupon & Gift Card Vault â€” Invite Whitelist, Signup Guard & Profile Removal
-- ============================================================================

-- 1. Invited accounts table (only Super Admin can view/manage pending invites)
create table if not exists public.invited_accounts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  display_name text not null,
  role text not null default 'viewer' check (role in ('super_admin', 'contributor', 'viewer')),
  can_read_codes boolean not null default false,
  invite_token text not null unique,
  invited_by uuid references public.profiles(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists invited_accounts_email_lower_idx
  on public.invited_accounts (lower(email));

create index if not exists invited_accounts_invited_by_idx
  on public.invited_accounts (invited_by);

alter table public.invited_accounts enable row level security;

grant select, insert, update, delete on public.invited_accounts to authenticated;

drop policy if exists "invited_accounts_select_super_admin" on public.invited_accounts;
create policy "invited_accounts_select_super_admin"
  on public.invited_accounts for select
  to authenticated
  using ( (select private.get_my_role()) = 'super_admin' );

drop policy if exists "invited_accounts_insert_super_admin" on public.invited_accounts;
create policy "invited_accounts_insert_super_admin"
  on public.invited_accounts for insert
  to authenticated
  with check ( (select private.get_my_role()) = 'super_admin' );

drop policy if exists "invited_accounts_update_super_admin" on public.invited_accounts;
create policy "invited_accounts_update_super_admin"
  on public.invited_accounts for update
  to authenticated
  using ( (select private.get_my_role()) = 'super_admin' )
  with check ( (select private.get_my_role()) = 'super_admin' );

drop policy if exists "invited_accounts_delete_super_admin" on public.invited_accounts;
create policy "invited_accounts_delete_super_admin"
  on public.invited_accounts for delete
  to authenticated
  using ( (select private.get_my_role()) = 'super_admin' );

-- 2. Tighten `public.profiles` policies (only active members read profiles; Super Admin can remove members)
drop policy if exists "profiles_select_authenticated" on public.profiles;
drop policy if exists "profiles_select_active_members" on public.profiles;
create policy "profiles_select_active_members"
  on public.profiles for select
  to authenticated
  using ( (select private.get_my_role()) in ('super_admin', 'contributor', 'viewer') );

grant delete on public.profiles to authenticated;

drop policy if exists "profiles_delete_super_admin_only" on public.profiles;
create policy "profiles_delete_super_admin_only"
  on public.profiles for delete
  to authenticated
  using (
    (select private.get_my_role()) = 'super_admin'
    and id <> (select auth.uid())
  );

-- 3. Enforce invite-only signup after the first Super Admin account is created
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  is_first_user boolean;
  inv record;
  chosen_name text;
  provided_token text;
begin
  select not exists (select 1 from public.profiles) into is_first_user;

  if is_first_user then
    chosen_name := coalesce(
      nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
      split_part(coalesce(new.email, 'Admin'), '@', 1)
    );
    insert into public.profiles (id, email, display_name, role, can_read_codes)
    values (
      new.id,
      lower(coalesce(new.email, 'admin@couponvault.local')),
      chosen_name,
      'super_admin',
      true
    );
    insert into public.activity_logs (action, title, detail, actor_id, actor_name)
    values (
      'ADMIN_SETUP',
      'Super Admin account created (' || lower(coalesce(new.email, '')) || ')',
      'Initial vault owner setup',
      new.id,
      chosen_name
    );
    return new;
  end if;

  provided_token := nullif(trim(coalesce(new.raw_user_meta_data->>'invite_token', '')), '');

  select *
    into inv
  from public.invited_accounts
  where lower(email) = lower(coalesce(new.email, ''))
    and accepted_at is null
    and invite_token = provided_token
  limit 1;

  if not found then
    raise exception 'Invite-only vault: Your email is not authorized or the invitation link is invalid/expired.';
  end if;

  insert into public.profiles (id, email, display_name, role, can_read_codes)
  values (
    new.id,
    lower(new.email),
    inv.display_name,
    inv.role,
    inv.can_read_codes
  );

  update public.invited_accounts
  set accepted_at = now(),
      updated_at = now()
  where id = inv.id;

  insert into public.activity_logs (action, title, detail, actor_id, actor_name)
  values (
    'ACTIVATED',
    inv.display_name || ' (' || lower(new.email) || ') activated their account',
    'Role: ' || inv.role,
    new.id,
    inv.display_name
  );

  return new;
end;
$$;

-- ============================================================================
-- Always-Hidden Codes, Reveal Access Control, Creator Public/Private & Notifications
-- ============================================================================

alter table public.coupons
  add column if not exists code_visibility text not null default 'public'
  check (code_visibility in ('public', 'private'));

update public.coupons
set code_visibility = case when admin_only_code then 'private' else 'public' end
where admin_only_code = true and code_visibility = 'public';

create or replace function private.guard_coupon_visibility()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.code_visibility is null then
      new.code_visibility := case when coalesce(new.admin_only_code, false) then 'private' else 'public' end;
    end if;
    new.admin_only_code := (new.code_visibility = 'private');
    return new;
  end if;

  if (new.code_visibility is distinct from old.code_visibility or new.admin_only_code is distinct from old.admin_only_code) then
    if (select private.get_my_role()) <> 'super_admin' and old.created_by is distinct from (select auth.uid()) then
      raise exception 'Only the coupon creator or Super Admin can change code visibility (Public/Private).';
    end if;

    if new.code_visibility is distinct from old.code_visibility then
      new.admin_only_code := (new.code_visibility = 'private');
    elsif new.admin_only_code is distinct from old.admin_only_code then
      new.code_visibility := case when new.admin_only_code then 'private' else 'public' end;
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function private.guard_coupon_visibility() from public, anon, authenticated;

drop trigger if exists trg_guard_coupon_visibility on public.coupons;
create trigger trg_guard_coupon_visibility
  before insert or update on public.coupons
  for each row execute function private.guard_coupon_visibility();

create table if not exists public.coupon_access_requests (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  owner_id uuid references public.profiles(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  request_note text default '',
  responded_by uuid references public.profiles(id) on delete set null,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (coupon_id, requester_id)
);

create index if not exists coupon_access_requests_coupon_idx on public.coupon_access_requests (coupon_id);
create index if not exists coupon_access_requests_requester_idx on public.coupon_access_requests (requester_id);
create index if not exists coupon_access_requests_owner_idx on public.coupon_access_requests (owner_id);
create index if not exists coupon_access_requests_status_idx on public.coupon_access_requests (status);

alter table public.coupon_access_requests enable row level security;

revoke all on public.coupon_access_requests from anon, public;
grant select on public.coupon_access_requests to authenticated;

drop policy if exists "coupon_access_requests_select_involved" on public.coupon_access_requests;
create policy "coupon_access_requests_select_involved"
  on public.coupon_access_requests for select
  to authenticated
  using (
    requester_id = (select auth.uid())
    or owner_id = (select auth.uid())
    or (select private.get_my_role()) = 'super_admin'
  );

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('code_request', 'code_approved', 'code_rejected', 'info')),
  title text not null,
  message text default '',
  coupon_id uuid references public.coupons(id) on delete cascade,
  request_id uuid references public.coupon_access_requests(id) on delete cascade,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (user_id) where is_read = false;

alter table public.notifications enable row level security;

revoke all on public.notifications from anon, public;
grant select, update, delete on public.notifications to authenticated;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
  on public.notifications for select
  to authenticated
  using ( user_id = (select auth.uid()) );

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
  on public.notifications for update
  to authenticated
  using ( user_id = (select auth.uid()) )
  with check ( user_id = (select auth.uid()) );

drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own"
  on public.notifications for delete
  to authenticated
  using ( user_id = (select auth.uid()) );

drop policy if exists "coupon_secrets_select_authorized_only" on public.coupon_secrets;
create policy "coupon_secrets_select_authorized_only"
  on public.coupon_secrets for select
  to authenticated
  using (
    (select private.get_my_role()) = 'super_admin'
    or (
      (select private.get_my_role()) in ('super_admin', 'contributor', 'viewer')
      and exists (
        select 1
        from public.coupons c
        where c.id = coupon_secrets.coupon_id
          and (
            c.created_by = (select auth.uid())
            or c.code_visibility = 'public'
            or exists (
              select 1
              from public.coupon_access_requests r
              where r.coupon_id = c.id
                and r.requester_id = (select auth.uid())
                and r.status = 'approved'
            )
          )
      )
    )
  );

drop policy if exists "coupon_secrets_insert_contributors_and_admin" on public.coupon_secrets;
create policy "coupon_secrets_insert_contributors_and_admin"
  on public.coupon_secrets for insert
  to authenticated
  with check (
    (select private.get_my_role()) = 'super_admin'
    or (
      (select private.get_my_role()) = 'contributor'
      and exists (
        select 1
        from public.coupons c
        where c.id = coupon_secrets.coupon_id
          and (c.created_by = (select auth.uid()) or c.created_by is null)
      )
    )
  );

drop policy if exists "coupon_secrets_update_contributors_and_admin" on public.coupon_secrets;
create policy "coupon_secrets_update_contributors_and_admin"
  on public.coupon_secrets for update
  to authenticated
  using (
    (select private.get_my_role()) = 'super_admin'
    or (
      (select private.get_my_role()) = 'contributor'
      and exists (
        select 1
        from public.coupons c
        where c.id = coupon_secrets.coupon_id
          and (c.created_by = (select auth.uid()) or c.created_by is null)
      )
    )
  )
  with check (
    (select private.get_my_role()) = 'super_admin'
    or (
      (select private.get_my_role()) = 'contributor'
      and exists (
        select 1
        from public.coupons c
        where c.id = coupon_secrets.coupon_id
          and (c.created_by = (select auth.uid()) or c.created_by is null)
      )
    )
  );

create or replace function public.request_coupon_access(
  p_coupon_id uuid,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_requester record;
  v_coupon record;
  v_existing record;
  v_req_id uuid;
  v_clean_note text := trim(coalesce(p_note, ''));
  v_notified_count integer := 0;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select id, display_name, email, role
    into v_requester
  from public.profiles
  where id = v_uid;

  if not found then
    raise exception 'Active vault profile not found.';
  end if;

  select id, store, account, created_by, code_visibility
    into v_coupon
  from public.coupons
  where id = p_coupon_id;

  if not found then
    raise exception 'Coupon not found.';
  end if;

  if v_coupon.code_visibility = 'public' or v_coupon.created_by = v_uid or v_requester.role = 'super_admin' then
    return jsonb_build_object(
      'status', 'already_open',
      'coupon_id', v_coupon.id
    );
  end if;

  select id, status
    into v_existing
  from public.coupon_access_requests
  where coupon_id = p_coupon_id
    and requester_id = v_uid;

  if found and v_existing.status = 'approved' then
    return jsonb_build_object(
      'status', 'already_approved',
      'request_id', v_existing.id,
      'coupon_id', v_coupon.id
    );
  end if;

  insert into public.coupon_access_requests (
    coupon_id,
    requester_id,
    owner_id,
    status,
    request_note,
    responded_by,
    responded_at,
    updated_at
  )
  values (
    v_coupon.id,
    v_uid,
    v_coupon.created_by,
    'pending',
    v_clean_note,
    null,
    null,
    now()
  )
  on conflict (coupon_id, requester_id) do update
  set owner_id = excluded.owner_id,
      status = 'pending',
      request_note = case when v_clean_note <> '' then v_clean_note else public.coupon_access_requests.request_note end,
      responded_by = null,
      responded_at = null,
      updated_at = now()
  returning id into v_req_id;

  if v_coupon.created_by is not null and v_coupon.created_by <> v_uid then
    insert into public.notifications (user_id, type, title, message, coupon_id, request_id)
    values (
      v_coupon.created_by,
      'code_request',
      '🔔 Code Request: ' || v_coupon.store || ' (' || v_coupon.account || ')',
      v_requester.display_name || ' (' || v_requester.email || ') wants to reveal this private coupon code.'
        || case when v_clean_note <> '' then ' Note: "' || v_clean_note || '"' else '' end,
      v_coupon.id,
      v_req_id
    );
    v_notified_count := 1;
  else
    insert into public.notifications (user_id, type, title, message, coupon_id, request_id)
    select
      p.id,
      'code_request',
      '🔔 Code Request: ' || v_coupon.store || ' (' || v_coupon.account || ')',
      v_requester.display_name || ' (' || v_requester.email || ') wants to reveal this private coupon code.'
        || case when v_clean_note <> '' then ' Note: "' || v_clean_note || '"' else '' end,
      v_coupon.id,
      v_req_id
    from public.profiles p
    where p.role = 'super_admin'
      and p.id <> v_uid;
    get diagnostics v_notified_count = row_count;
  end if;

  insert into public.activity_logs (action, title, detail, actor_id, actor_name)
  values (
    'ACCESS_REQUESTED',
    'Code access requested for ' || v_coupon.store || ' (' || v_coupon.account || ')',
    case when v_clean_note <> '' then 'Note: ' || v_clean_note || ' • ' else '' end
      || 'By ' || v_requester.display_name || ' (' || v_requester.email || ')',
    v_uid,
    v_requester.display_name
  );

  return jsonb_build_object(
    'status', 'pending',
    'request_id', v_req_id,
    'coupon_id', v_coupon.id,
    'notified_count', v_notified_count
  );
end;
$$;

create or replace function public.respond_coupon_access(
  p_request_id uuid,
  p_decision text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_actor record;
  v_req record;
  v_coupon record;
  v_requester record;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected.';
  end if;

  select id, display_name, email, role
    into v_actor
  from public.profiles
  where id = v_uid;

  if not found then
    raise exception 'Active vault profile not found.';
  end if;

  select *
    into v_req
  from public.coupon_access_requests
  where id = p_request_id;

  if not found then
    raise exception 'Access request not found.';
  end if;

  select id, store, account, created_by
    into v_coupon
  from public.coupons
  where id = v_req.coupon_id;

  if not found then
    raise exception 'Coupon not found.';
  end if;

  if v_actor.role <> 'super_admin' and v_coupon.created_by is distinct from v_uid then
    raise exception 'Only the coupon creator or Super Admin can approve or decline access requests.';
  end if;

  select id, display_name, email
    into v_requester
  from public.profiles
  where id = v_req.requester_id;

  update public.coupon_access_requests
  set status = p_decision,
      responded_by = v_uid,
      responded_at = now(),
      updated_at = now()
  where id = p_request_id;

  update public.notifications
  set is_read = true
  where request_id = p_request_id
    and type = 'code_request'
    and is_read = false;

  insert into public.notifications (user_id, type, title, message, coupon_id, request_id)
  values (
    v_req.requester_id,
    case when p_decision = 'approved' then 'code_approved' else 'code_rejected' end,
    case
      when p_decision = 'approved'
        then '🔑 Code Access Open: ' || v_coupon.store || ' (' || v_coupon.account || ')'
      else
        '🔒 Code Access Declined: ' || v_coupon.store || ' (' || v_coupon.account || ')'
    end,
    case
      when p_decision = 'approved'
        then v_actor.display_name || ' approved your request. This code is now open for you — click Reveal Code to view it!'
      else
        v_actor.display_name || ' declined/revoked your request to view this private coupon code.'
    end,
    v_coupon.id,
    v_req.id
  );

  insert into public.activity_logs (action, title, detail, actor_id, actor_name)
  values (
    case when p_decision = 'approved' then 'ACCESS_APPROVED' else 'ACCESS_REJECTED' end,
    case when p_decision = 'approved' then 'Approved ' else 'Declined ' end
      || coalesce(v_requester.display_name, 'Member') || ' for ' || v_coupon.store || ' (' || v_coupon.account || ')',
    'By ' || v_actor.display_name || ' (' || v_actor.email || ')',
    v_uid,
    v_actor.display_name
  );

  return jsonb_build_object(
    'status', p_decision,
    'request_id', v_req.id,
    'coupon_id', v_coupon.id
  );
end;
$$;

revoke execute on function public.request_coupon_access(uuid, text) from public, anon;
grant execute on function public.request_coupon_access(uuid, text) to authenticated;

revoke execute on function public.respond_coupon_access(uuid, text) from public, anon;
grant execute on function public.respond_coupon_access(uuid, text) to authenticated;

do $$
begin
  execute 'alter publication supabase_realtime add table public.notifications';
exception when others then null;
end $$;

do $$
begin
  execute 'alter publication supabase_realtime add table public.coupon_access_requests';
exception when others then null;
end $$;

