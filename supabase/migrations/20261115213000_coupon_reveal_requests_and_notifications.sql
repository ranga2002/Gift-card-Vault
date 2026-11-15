-- ============================================================================
-- Coupon & Gift Card Vault — Always-Hidden Codes, Reveal Access Control,
-- Creator Public/Private Visibility & All-User Notifications
-- ============================================================================

-- 1. Add Public/Private code visibility column to `public.coupons`
alter table public.coupons
  add column if not exists code_visibility text not null default 'public'
  check (code_visibility in ('public', 'private'));

update public.coupons
set code_visibility = case when admin_only_code then 'private' else 'public' end
where admin_only_code = true and code_visibility = 'public';

-- Keep `admin_only_code` & `code_visibility` synchronized and restrict
-- visibility changes to the coupon's creator or a Super Admin.
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

-- 2. Coupon Code Access Requests table
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

-- 3. Notifications table (available to ALL authenticated users)
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

-- 4. Tighten `public.coupon_secrets` RLS Policies:
-- Readable ONLY by:
--   a) Super Admin, OR
--   b) Coupon creator (`c.created_by = auth.uid()`), OR
--   c) Any active member when `c.code_visibility = 'public'`, OR
--   d) A specific user whose `coupon_access_requests.status = 'approved'`
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

-- 5. Safe RPCs for Requesting & Approving/Rejecting Coupon Code Access
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

  -- Notify the creator directly (or Super Admins if legacy coupon has no creator)
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

-- Enable live Postgres Changes events when Supabase Realtime is active
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
