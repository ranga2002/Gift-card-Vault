# F07: Redemption history — staging acceptance plan

**Status as of November 20, 2026:** feature code and SQL migration on the
GitHub feature branch. **No Supabase migration has been applied.** Do not
deploy this release to production before testing on a separate staging database.

## Architecture

- Migration: supabase/migrations/20261120223000_atomic_redemption_history.sql
- Data: coupon_transactions with amount delta, before/after balances, actor, time
  and client-generated request ID. Transactions are append-only to app users.
- Redemption: public.redeem_coupon(uuid, numeric, uuid) validates the
  authenticated actor, checks card ownership/role, locks the card row, verifies
  the remaining balance, writes history and updates the card within the same
  PostgreSQL transaction.
- Client: both partial and full redemption call the RPC. No direct database
  update fallback is allowed if the migration is missing.
- Existing direct balance edits automatically create audit entries of type
  adjustment through a database trigger.
- Frontend: read-only history in classic and wallet card-detail screens.
- Currency: existing INR. F04 multi-currency is not part of this migration.

## Staging rollout sequence

1. Create or use a **separate staging Supabase project** and take a backup.
2. Apply existing migrations in chronological order, followed by the F07 SQL.
3. Check the created table, triggers, policies and function privileges.
4. Create synthetic gift cards and test accounts: a Super Admin, a contributor
   who owns a card, a different contributor, and a viewer.
5. Point the **staging web app** at the staging project using only the browser
   publishable/anon key. Never add a service-role key to the frontend.
6. Test the scenarios below, including two separate simultaneous sessions.
7. Run all GitHub Actions tests and a complete authentication regression pass.
8. Document results and only then consider a controlled production release.

## Acceptance scenarios

| # | Test | Expected |
|---|---|---|
| 1 | Owner redeems ₹25 from ₹100 | ₹75 remains; one ledger redemption row, delta −₹25 |
| 2 | Owner fully redeems the remaining ₹75 | ₹0 remains, status used, second row |
| 3 | Owner tries spending ₹101 from ₹100 | Rejected, no balance/ledger mutation |
| 4 | Zero, negative or three-decimal spend | Rejected |
| 5 | Repeat the same client request UUID with same card and amount | Same result returned, one deduction |
| 6 | Reuse request UUID for another amount or card | Rejected |
| 7 | Two concurrent ₹70 spends on one ₹100 card | At most one succeeds, balance never negative |
| 8 | Viewer attempts direct RPC redemption | Rejected |
| 9 | Another contributor tries to spend owner's card | Rejected |
| 10 | Owner edits balance without redeeming | Recorded as a balance adjustment |
| 11 | Contributor edits someone else's balance | Trigger rejects |
| 12 | Client tries INSERT/UPDATE/DELETE on ledger | Denied |
| 13 | Signed-in viewer reads history | Monetary metadata visible; secret codes not included |
| 14 | User tries deleting a card with ledger records | FK prevents deleting audit history |
| 15 | No migration installed and user clicks Spend | Clear error, no direct UPDATE fallback |
| 16 | Web refresh / mobile WebView reload after redemption | Balance and history persist |
| 17 | Edit card without changing amount | No false adjustment |
| 18 | Secret-code reveal and family approval flows | Remain protected by existing RLS |

## Verification SQL (run only in staging)

~~~sql
select id, coupon_id, actor_id, transaction_type,
       amount_delta, balance_before, balance_after,
       request_id, created_at
from public.coupon_transactions
order by created_at desc
limit 30;

select c.id, c.store, c.amount, c.status,
       count(t.id) as transaction_count
from public.coupons c
left join public.coupon_transactions t on t.coupon_id = c.id
group by c.id, c.store, c.amount, c.status
order by c.store;
~~~

## Known limitations / next tasks

- Older activity-log text cannot reliably reconstruct historical spends.
  The new ledger starts on migration application.
- The UI currently fetches the most recent 500 history records; pagination
  is still needed for large vaults.
- Direct edit-card balance adjustments still write absolute amounts, not
  compare-and-swap operations. Concurrent edits and redemptions need further
  hardening (an atomic adjustment RPC is recommended).
- Card deletes with transactions are blocked to protect the audit trail.
  An archive/retention workflow should be added.
- Supabase service-role jobs, SQL-console updates, and other integrations
  must be regression-tested against the new balance-owner trigger.
- This is a **database migration**, not a frontend-only change.
  No runtime database test has been performed by creating these files.
