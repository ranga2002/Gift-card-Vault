-- F04 database acceptance: native-denomination balances, strict cross
-- currency block, issuer-approved exception, same-id retries, revocation,
-- immutable card currency and audit. Synthetic data only.
\set ON_ERROR_STOP on
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
create function pg_temp.expect_failure(query text,reason text)
returns void language plpgsql as $$
declare rejected boolean:=false;
begin
  begin execute query;
  exception when others then rejected:=true; end;
  if not rejected then raise exception 'Expected rejection: %',reason; end if;
end;
$$;
do $$
begin
  if to_regprocedure('public.redeem_coupon(uuid,numeric,uuid)') is not null then
    raise exception 'Old 3-parameter redemption RPC remains callable.';
  end if;
end $$;

insert into public.coupons(id,store,account,amount,initial_amount,expiry,created_by,currency_code)
values
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','Synthetic CAD card','Personal',100,100,'2099-12-31','11111111-1111-4111-8111-111111111111','CAD'),
('ffffffff-ffff-4fff-8fff-ffffffffffff','Synthetic USD card','Personal',100,100,'2099-12-31','11111111-1111-4111-8111-111111111111','USD');

-- Exact currency with no exception works: 20 CAD deducted, 20 CAD charged.
do $$
declare result jsonb; n integer;
begin
 result:=public.redeem_coupon('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',20,
 'a1000000-0000-4000-8000-000000000001','CAD',20);
 if result->>'currency'<>'CAD' or result->>'merchant_currency'<>'CAD'
    or (result->>'remaining')::numeric<>80 then
   raise exception 'Same-currency CAD ledger mismatch: %',result;
 end if;
 select count(*) into n from public.coupon_transactions where
   coupon_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
   and currency_code='CAD' and settlement_currency='CAD' and settlement_amount=20;
 if n<>1 then raise exception 'CAD settlement transaction not captured';end if;
end $$;
-- Old or incorrect source denomination requests may NOT be silently accepted.
select pg_temp.expect_failure(
 'select public.redeem_coupon(''eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'',10,''a1000000-0000-4000-8000-000000000002'',''USD'',7.50)',
 'CAD card spent at USD checkout without exact issuer permission');
select pg_temp.expect_failure(
 'select public.redeem_coupon(''eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'',10,''a1000000-0000-4000-8000-000000000003'',''CAD'',11)',
 'same currency settlement differs from debit');
select pg_temp.expect_failure(
 'select public.redeem_coupon(''eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'',10,''a1000000-0000-4000-8000-000000000004'',''XYZ'',10)',
 'unsupported merchant currency');

select pg_temp.expect_failure(
 'select public.approve_coupon_currency_exception(''eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'',''USD'',''https://issuer.example/terms'',''An issuer confirmed this card pair'',null)',
 'contributors cannot approve issuer exceptions');

-- Viewer cannot issue issuer rules.
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
select pg_temp.expect_failure(
 'select public.approve_coupon_currency_exception(''eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'',''USD'',''https://issuer.example/terms'',''An issuer confirmed this card pair'',null)',
 'viewer attempted issuer approval');

-- Only Super Admin can record confirmation with issuer proof.
select set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',false);
select pg_temp.expect_failure(
 'select public.approve_coupon_currency_exception(''eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'',''USD'',''http://unverified.example/terms'',''No official HTTPS evidence'',null)',
 'http issuer evidence rejected');
select public.approve_coupon_currency_exception(
 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','USD',
 'https://issuer.example/fictional-terms',
 'FICTIONAL TEST ONLY: this exact CAD test card supports USD at checkout',
 null
);
do $$
declare count_rows integer;
begin
 select count(*) into count_rows from public.coupon_currency_exceptions
 where coupon_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
 and source_currency='CAD' and target_currency='USD' and active;
 if count_rows<>1 then raise exception 'Admin issuer verification not recorded';end if;
end $$;

-- Owning contributor can now record actual card debit and actual USD charge.
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
do $$
declare r jsonb; replay jsonb; n integer;
begin
 r:=public.redeem_coupon('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',10,
    'a1000000-0000-4000-8000-000000000005','USD',7.44);
 replay:=public.redeem_coupon('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',10,
    'a1000000-0000-4000-8000-000000000005','USD',7.44);
 if (r->>'remaining')::numeric<>70 or not (replay->>'replayed')::boolean then
   raise exception 'Approved foreign checkout or replay incorrect';
 end if;
 select count(*) into n from public.coupon_transactions where
   coupon_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
   and currency_code='CAD' and settlement_currency='USD'
   and settlement_amount=7.44 and amount_delta=-10
   and issuer_evidence_url='https://issuer.example/fictional-terms';
 if n<>1 then raise exception 'Issuer-backed CAD to USD ledger row missing';end if;
end $$;
select pg_temp.expect_failure(
 'select public.redeem_coupon(''eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'',10,''a1000000-0000-4000-8000-000000000005'',''USD'',7.45)',
 'same idempotency key with different merchant amount');

-- Admin revokes permission. Future foreign checkouts fail, history stays.
select set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',false);
select public.revoke_coupon_currency_exception(
 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','USD');
select pg_temp.expect_failure(
 'update public.coupons set currency_code=''USD'' where id=''eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee''',
 'card original denomination is immutable, even for admin');
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
select pg_temp.expect_failure(
 'select public.redeem_coupon(''eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'',5,''a1000000-0000-4000-8000-000000000006'',''USD'',4)',
 'rejected cross currency after issuer approval revoked');

-- Manual balance adjustment retains its native CAD denomination.
update public.coupons set amount=65
where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
do $$
declare num integer;
begin
 select count(*) into num from public.coupon_transactions where
   coupon_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
   and transaction_type='adjustment' and currency_code='CAD'
   and amount_delta=-5 and settlement_currency is null;
 if num<>1 then raise exception 'CAD adjustment was not recorded correctly';end if;
end $$;

-- USD card is independently redeemed as USD (no cross-currency math).
do $$
declare r jsonb;
begin
 r:=public.redeem_coupon('ffffffff-ffff-4fff-8fff-ffffffffffff',60,
 'a1000000-0000-4000-8000-000000000007','USD',60);
 if (r->>'remaining')::numeric<>40 then
   raise exception 'USD balance modified incorrectly';
 end if;
end $$;
reset role;
select 'F04 real SQL currency-denomination and issuer-verification tests passed' as result;
