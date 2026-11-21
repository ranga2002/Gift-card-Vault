-- Isolated Postgres fixture for F07. No user/project credentials or data.
-- Mimics Supabase's auth.uid() claim and app grants/RLS; this is NOT a
-- substitute for a real Supabase staging integration test.
\set ON_ERROR_STOP on
create role authenticated nologin;
create role anon nologin;
create schema if not exists auth;
create schema if not exists private;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
$$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;

create table auth.users (id uuid primary key);
create table public.profiles (
  id uuid primary key references auth.users(id),
  email text not null,
  display_name text not null,
  role text not null check(role in ('viewer','contributor','super_admin')),
  can_read_codes boolean not null default false
);
create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  store text not null,
  account text not null,
  benefit_type text not null default 'Gift Card / Wallet',
  amount numeric(12,2) not null default 0 check (amount>=0),
  initial_amount numeric(12,2) not null default 0,
  expiry date not null,
  notes text default '',
  status text not null default 'active' check (status in ('active','used')),
  admin_only_code boolean not null default false,
  code_visibility text not null default 'public',
  has_secret_code boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create function private.get_my_role() returns text
  language sql stable security definer set search_path = '' as $$
    select role from public.profiles where id = (select auth.uid());
  $$;
grant execute on function private.get_my_role() to authenticated;
-- In the actual project private schema has USAGE revoked for application
-- sessions; RLS policy functions are compiled by OID and invoked by Postgres.
revoke all on schema private from public, anon, authenticated;
grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
grant select,insert,update,delete on public.coupons to authenticated;
alter table public.profiles enable row level security;
alter table public.coupons enable row level security;
create policy profiles_select on public.profiles for select to authenticated
  using ((select private.get_my_role()) in ('viewer','contributor','super_admin'));
create policy coupons_select on public.coupons for select to authenticated
  using ((select private.get_my_role()) in ('viewer','contributor','super_admin'));
create policy coupons_insert on public.coupons for insert to authenticated
  with check ((select private.get_my_role()) in ('contributor','super_admin'));
create policy coupons_update on public.coupons for update to authenticated
  using ((select private.get_my_role()) in ('contributor','super_admin'))
  with check ((select private.get_my_role()) in ('contributor','super_admin'));
create policy coupons_delete on public.coupons for delete to authenticated
  using ((select private.get_my_role()) = 'super_admin');

insert into auth.users(id) values
 ('11111111-1111-4111-8111-111111111111'),
 ('22222222-2222-4222-8222-222222222222'),
 ('33333333-3333-4333-8333-333333333333'),
 ('44444444-4444-4444-8444-444444444444');
insert into public.profiles(id,email,display_name,role) values
 ('11111111-1111-4111-8111-111111111111','owner@example.invalid','Owner','contributor'),
 ('22222222-2222-4222-8222-222222222222','other@example.invalid','Other','contributor'),
 ('33333333-3333-4333-8333-333333333333','viewer@example.invalid','Viewer','viewer'),
 ('44444444-4444-4444-8444-444444444444','admin@example.invalid','Admin','super_admin');
insert into public.coupons (id,store,account,amount,initial_amount,expiry,created_by) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Staging card','Personal',100,100,'2099-12-31','11111111-1111-4111-8111-111111111111'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Concurrent card','Personal',100,100,'2099-12-31','11111111-1111-4111-8111-111111111111'),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','Admin card','Personal',100,100,'2099-12-31','44444444-4444-4444-8444-444444444444'),
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','Expired card','Personal',100,100,'2020-01-01','11111111-1111-4111-8111-111111111111');

-- Values used in tests are synthetic and cannot redeem real gift cards.
