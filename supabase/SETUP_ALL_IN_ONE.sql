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
create policy "profiles_select_authenticated"
  on public.profiles for select
  to authenticated
  using ( (select auth.uid()) is not null );

-- Only Super Admin can update roles and `can_read_codes` permissions
create policy "profiles_update_super_admin_only"
  on public.profiles for update
  to authenticated
  using ( (select private.get_my_role()) = 'super_admin' )
  with check ( (select private.get_my_role()) = 'super_admin' );

-- 2. Policies for `public.coupons`
-- All signed-in friends (viewer, contributor, super_admin) can view store balances & accounts
create policy "coupons_select_all_members"
  on public.coupons for select
  to authenticated
  using ( (select private.get_my_role()) in ('super_admin', 'contributor', 'viewer') );

-- Only Super Admin and Contributors can add coupons
create policy "coupons_insert_contributors_and_admin"
  on public.coupons for insert
  to authenticated
  with check ( (select private.get_my_role()) in ('super_admin', 'contributor') );

-- Only Super Admin and Contributors can update balances
create policy "coupons_update_contributors_and_admin"
  on public.coupons for update
  to authenticated
  using ( (select private.get_my_role()) in ('super_admin', 'contributor') )
  with check ( (select private.get_my_role()) in ('super_admin', 'contributor') );

-- Only Super Admin can delete coupons
create policy "coupons_delete_super_admin_only"
  on public.coupons for delete
  to authenticated
  using ( (select private.get_my_role()) = 'super_admin' );

-- 3. Policies for `public.coupon_secrets` (THE CODE VISIBILITY GATE!)
-- Secret coupon codes are ONLY readable if:
--   a) The user is `super_admin`, OR
--   b) The user has `can_read_codes = true` AND the coupon is not flagged `admin_only_code`
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

create policy "coupon_secrets_insert_contributors_and_admin"
  on public.coupon_secrets for insert
  to authenticated
  with check ( (select private.get_my_role()) in ('super_admin', 'contributor') );

create policy "coupon_secrets_update_contributors_and_admin"
  on public.coupon_secrets for update
  to authenticated
  using ( (select private.get_my_role()) in ('super_admin', 'contributor') )
  with check ( (select private.get_my_role()) in ('super_admin', 'contributor') );

create policy "coupon_secrets_delete_super_admin_only"
  on public.coupon_secrets for delete
  to authenticated
  using ( (select private.get_my_role()) = 'super_admin' );

-- 4. Policies for `public.activity_logs`
create policy "activity_logs_select_all_members"
  on public.activity_logs for select
  to authenticated
  using ( (select private.get_my_role()) in ('super_admin', 'contributor', 'viewer') );

create policy "activity_logs_insert_contributors_and_admin"
  on public.activity_logs for insert
  to authenticated
  with check ( (select private.get_my_role()) in ('super_admin', 'contributor') );

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

create policy "invited_accounts_select_super_admin"
  on public.invited_accounts for select
  to authenticated
  using ( (select private.get_my_role()) = 'super_admin' );

create policy "invited_accounts_insert_super_admin"
  on public.invited_accounts for insert
  to authenticated
  with check ( (select private.get_my_role()) = 'super_admin' );

create policy "invited_accounts_update_super_admin"
  on public.invited_accounts for update
  to authenticated
  using ( (select private.get_my_role()) = 'super_admin' )
  with check ( (select private.get_my_role()) = 'super_admin' );

create policy "invited_accounts_delete_super_admin"
  on public.invited_accounts for delete
  to authenticated
  using ( (select private.get_my_role()) = 'super_admin' );

-- 2. Tighten `public.profiles` policies (only active members read profiles; Super Admin can remove members)
drop policy if exists "profiles_select_authenticated" on public.profiles;
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

