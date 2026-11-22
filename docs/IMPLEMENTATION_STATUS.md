# Gift Vault enhancement rollout

**Branch status:** feature branch / Draft PR #1. Not production-deployed.
**Functional milestone:** F07 — redemption history code implemented; staging database migration and multi-user verification **pending**.

## Implemented on this feature branch

- Wallet-style authenticated UI integrated with existing Supabase permission checks.
- Card search/filter, expiry insights, protected code requests and member roles.
- Sample-only interactive preview, consistent outline icons, PWA shell.
- Calendar reminder URLs no longer contain revealed redemption codes.
- F07: atomic public.redeem_coupon RPC, append-only transaction ledger,
  idempotent retries, and audit entries for manual balance adjustments.
- Partial and full redemption now call the RPC instead of writing coupon balances
  directly. There is no unsafe fallback when the migration is missing.
- History in classic card actions and wallet card details.
- 22 passing Node tests in GitHub Actions (static and mocked client checks).
- Isolated PostgreSQL 16 CI now executes the real F07 SQL migration against
  synthetic Supabase-like auth/RLS fixtures, including balance correctness,
  role isolation, idempotency, ledger immutability, and two-connection
  concurrency tests. Both sets of checks pass.
- This is **not** verification against an actual Supabase staging project.

## F02 — Smart expiry notifications (in-app phase)

**Code implemented on the feature branch; no Supabase access or production rollout.**

- Calculates local calendar-day expiry stages at 30, 15, 7, 3 and 1 days,
  plus expiry day and past-due active cards.
- Alert center in the signed-in wallet, accessible from the header bell.
- Read, snooze to the next day, dismiss, and a compact local action history.
- Global on-device enable/disable and timing preferences, plus per-card
  enable/disable and optional custom reminder timing.
- Account-scoped device storage contains only alert identifiers, dates and
  preferences, not merchant names, amounts or redemption codes.
- Existing Supabase access-request notifications remain available via
  the alert center's **Account notifications** button.
- Sample-data interactive preview uses dates relative to the day it opens.
- 13 new reminder tests; 35/35 total Node tests passed in GitHub Actions.
  Isolated F07 PostgreSQL integration tests continue to pass.
- Browser preview verified alert badges, actions, preference controls and
  card-level reminder settings.

**Not built yet:** Background delivery while closed, scheduled email or push,
server-side durable preferences and cross-device synchronization. These
require a backend job/scheduler and database access. Browser device storage
can be cleared independently of the account.

**F02 acceptance:** in-app reminder milestone implemented and smoke tested;
production readiness and backend email/push scheduling pending.

## F03 — Advanced Search, Filtering and Sorting

**Implemented in the mobile-first authenticated wallet (feature branch only).**

- Combined live search across store, account, card type and notes.
- Filter by store, account, card type, derived active / used / expired status,
  upcoming expiry window (7/14/30 days), expired date, and no expiry date.
- Optional minimum and maximum INR balance, inclusive.
- Sort expiry soonest/latest, balance high/low, store A-Z/Z-A, recent add,
  and account A-Z. Cards without an expiry date sort last in both directions.
- Filter result counts, active-filter count, reset, and useful empty states.
- The wallet supports viewing historical/used cards through status selection;
  the existing classic manager remains available and its filters are unchanged.
- Filters operate only on card metadata authorized by the existing Supabase
  session. Redemption codes and secret values are never indexed or stored.
- Filters live only in this browser tab and reset when the signed-in user changes;
  no extra Supabase schema, network API, or local storage is needed.
- Sample-data preview covers active, expired, fully used and undated cards.
- 17 focused F03 engine/UI tests added. 52 total JavaScript tests passed
  in GitHub Actions, along with isolated F07 PostgreSQL regression tests.
- Browser verification passed: Used / Expired card filters, balance sorting,
  reset, visible text search and search clearing on sample cards.

**Still pending:** validation with real Supabase users and database; optimized
server-side pagination/search for very large vaults.

## Deployment gate — do not skip

1. Do NOT apply the F07 migration to production before testing in staging.
2. Use an isolated Supabase staging project and follow the test scenarios in
   docs/F07_REDEMPTION_STAGING_VALIDATION.md.
3. Regression-test invitations, roles, card CRUD, code access, notifications,
   Android WebView, and DB row-level security with distinct test users.
4. Cards with transaction history can no longer be physically deleted;
   an archive/retention workflow may be needed before release.
5. No service-role keys in the frontend, GitHub repo, or public previews.
6. No revealed redemption codes in logs, calendar URLs, or PWA caches.
7. Older historical spend events cannot be reconstructed reliably from the
   old free-text logger; ledger history starts after migration application.

## Next work

- Execute F07 staging Supabase-specific integration and full regression tests
  (the isolated PostgreSQL CI checks already pass).
- Add atomic balance-adjustment RPC and cursor-based ledger pagination.
- F02 server-side email/push delivery and durable cross-device preferences.
- Multi-currency data, scanning/OCR, barcode/QR display, family isolation,
  advanced analytics and full Supabase integration tests.
