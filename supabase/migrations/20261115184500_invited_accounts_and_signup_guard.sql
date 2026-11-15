-- ============================================================================
-- Coupon & Gift Card Vault — Invite Whitelist, Signup Guard & Profile Removal
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

