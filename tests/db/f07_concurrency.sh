#!/usr/bin/env bash
set -euo pipefail

# Uses only the isolated GitHub Actions PostgreSQL service. Synthetic fixture:
# "Concurrent card" starts at 100. Two distinct sessions try to spend 70 each.
# A row lock means exactly one wins, the other sees the new balance and fails.

psql -X -v ON_ERROR_STOP=1 > /tmp/gift-vault-first-redemption.log 2>&1 <<'SQL' &
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
begin;
select id from public.coupons
where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' for update;
select pg_sleep(2);
select public.redeem_coupon(
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,
 70::numeric,
 '51000000-0000-4000-8000-000000000001'::uuid
);
commit;
SQL
first_pid=$!
sleep 0.5
if psql -X -v ON_ERROR_STOP=1 > /tmp/gift-vault-second-redemption.log 2>&1 <<'SQL'
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
select public.redeem_coupon(
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,
 70::numeric,
 '52000000-0000-4000-8000-000000000002'::uuid
);
SQL
then
  cat /tmp/gift-vault-second-redemption.log
  echo "ERROR: second concurrent spend unexpectedly succeeded"
  exit 1
fi

if ! wait "$first_pid"; then
  cat /tmp/gift-vault-first-redemption.log
  echo "ERROR: first concurrent spend failed"
  exit 1
fi

balance=$(psql -X -v ON_ERROR_STOP=1 -Atc "
 select amount from public.coupons
 where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'")
count=$(psql -X -v ON_ERROR_STOP=1 -Atc "
 select count(*) from public.coupon_transactions
 where coupon_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'")

if [[ "$balance" != "30.00" || "$count" != "1" ]]; then
  echo "ERROR: expected one successful 70 redemption, balance 30; got balance=$balance, rows=$count"
  exit 1
fi
echo "PASS: two concurrent 70 spends on a 100 card -> exactly one ledger row and 30 balance"
