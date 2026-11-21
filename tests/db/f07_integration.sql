-- This script exercises the exact, checked-in F07 migration against temporary
-- synthetic users and cards. Never point at a production or staging database.
\set ON_ERROR_STOP on
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);

create function pg_temp.expect_failure(query text, description text)
returns void language plpgsql as $$
declare failed boolean := false;
begin
  begin
    execute query;
  exception when others then
    failed := true;
  end;
  if not failed then
    raise exception 'Expected rejection: %', description;
  end if;
end;
$$;

-- 1. Owner partial spend, same-request replay and uniqueness.
do $$
declare
  initial jsonb;
  again jsonb;
begin
  initial := public.redeem_coupon(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',25,
    '10000000-0000-4000-8000-000000000001');
  if (initial->>'remaining')::numeric <> 75 or (initial->>'replayed')::boolean then
    raise exception 'Partial redemption returned incorrect balance: %', initial;
  end if;
  again := public.redeem_coupon(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',25,
    '10000000-0000-4000-8000-000000000001');
  if (again->>'remaining')::numeric <> 75
     or not (again->>'replayed')::boolean
     or again->>'transaction_id' <> initial->>'transaction_id' then
    raise exception 'Idempotent replay incorrect: %', again;
  end if;
end $$;

select pg_temp.expect_failure(
  'select public.redeem_coupon(''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'',30,''10000000-0000-4000-8000-000000000001'')',
  'same idempotency key but different amount'
);
select pg_temp.expect_failure(
  'select public.redeem_coupon(''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'',76,''10000000-0000-4000-8000-000000000002'')',
  'overdraw'
);
select pg_temp.expect_failure(
  'select public.redeem_coupon(''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'',0,''10000000-0000-4000-8000-000000000003'')',
  'zero spend'
);
select pg_temp.expect_failure(
  'select public.redeem_coupon(''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'',2.005,''10000000-0000-4000-8000-000000000004'')',
  'fractional cents'
);
select pg_temp.expect_failure(
  'select public.redeem_coupon(''dddddddd-dddd-4ddd-8ddd-dddddddddddd'',5,''10000000-0000-4000-8000-000000000005'')',
  'expired card'
);

-- 2. Fully spend the remaining ₹75, auto-status used.
do $$
declare
  result jsonb;
  balance numeric;
  card_status text;
  total integer;
begin
  result := public.redeem_coupon(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',75,
    '10000000-0000-4000-8000-000000000006');
  select amount,status into balance,card_status
  from public.coupons where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  select count(*) into total from public.coupon_transactions
    where coupon_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  if (result->>'remaining')::numeric<>0 or balance<>0 or card_status<>'used' or total<>2 then
    raise exception 'Full redemption or ledger count wrong (% | % | % | %)',
      result,balance,card_status,total;
  end if;
end $$;
select pg_temp.expect_failure(
  'select public.redeem_coupon(''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'',1,''10000000-0000-4000-8000-000000000007'')',
  'used card new spend'
);
-- A real retry still returns the committed transaction after card is used.
do $$
declare result jsonb;
begin
  result := public.redeem_coupon(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',75,
    '10000000-0000-4000-8000-000000000006');
  if not (result->>'replayed')::boolean then raise exception 'Replay failed after full use'; end if;
end $$;

-- 3. Adjustment via a direct edit generates exactly one adjustment ledger row.
update public.coupons set amount=100,status='active'
where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
do $$
declare total integer; prev numeric; next numeric; delta numeric;
begin
  select count(*) into total from public.coupon_transactions
    where coupon_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  select balance_before,balance_after,amount_delta into prev,next,delta
    from public.coupon_transactions
    where coupon_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and transaction_type='adjustment';
  if total<>3 or prev<>0 or next<>100 or delta<>100 then
    raise exception 'Balance adjustment missing or duplicated';
  end if;
end $$;
update public.coupons set notes='metadata-only edit'
where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
do $$
declare total integer;
begin
  select count(*) into total from public.coupon_transactions
    where coupon_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  if total<>3 then raise exception 'Metadata edit created bogus adjustment';end if;
end $$;

-- 4. Ledger is read-only to authenticated users. Physical deletes preserve it.
select pg_temp.expect_failure(
  'delete from public.coupon_transactions where coupon_id=''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa''',
  'ledger DELETE privilege');
select pg_temp.expect_failure(
  'update public.coupon_transactions set amount_delta=-99',
  'ledger UPDATE privilege');
select pg_temp.expect_failure(
  'insert into public.coupon_transactions(coupon_id,transaction_type,amount_delta,balance_before,balance_after) values (''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'',''redemption'',-1,100,99)',
  'ledger INSERT privilege');

-- 5. Another contributor cannot spend or adjust the owner's balance.
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
select pg_temp.expect_failure(
  'select public.redeem_coupon(''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'',5,''20000000-0000-4000-8000-000000000001'')',
  'other contributor redemption');
select pg_temp.expect_failure(
  'update public.coupons set amount=95 where id=''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa''',
  'other contributor direct adjustment');

-- 6. Viewer can SELECT history but cannot mutate balances or call RPC.
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
do $$
declare n integer;
begin
  select count(*) into n from public.coupon_transactions
  where coupon_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  if n<>3 then raise exception 'Viewer cannot see ledger rows';end if;
end $$;
select pg_temp.expect_failure(
  'select public.redeem_coupon(''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'',5,''30000000-0000-4000-8000-000000000001'')',
  'viewer redemption');
select pg_temp.expect_failure(
  'update public.coupons set amount=95 where id=''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa''',
  'viewer adjustment');

-- 7. Admin can redeem any member card but cannot destroy history.
select set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',false);
do $$
declare response jsonb;
begin
  response:=public.redeem_coupon(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',5,
    '40000000-0000-4000-8000-000000000001');
  if (response->>'remaining')::numeric<>95 then
    raise exception 'Admin redemption failed';
  end if;
end $$;
select pg_temp.expect_failure(
  'delete from public.coupons where id=''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa''',
  'transaction-protected physical deletion');

reset role;
select 'F07 isolated PostgreSQL validation passed' as test_result;
