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

## F04 — Multi-currency and issuer-specific redemption restrictions

**Implemented in feature-branch code; Supabase staging migration pending.**

- Gift cards have a fixed original denomination: **INR, CAD or USD**.
- Legacy cards and legacy ledger rows are backfilled as **INR**; check those
  assumptions during migration planning, especially if imported records may
  originally have represented CAD or USD.
- All wallet, classic dashboard, expiry alerts, history and card forms use
  native denomination labels; unrelated currencies are never added together.
- Currency filter is available. Balance filtering and balance-based sorting
  require selecting one denomination when more than one currency is present.
- Editing an existing card cannot change its denomination (UI check and SQL trigger).
- The 3-parameter F07 redemption function is **removed** after F04 migration.
  The new 5-parameter RPC requires card debit, request UUID, merchant currency
  and actual merchant charge.
- **Default block:** Cross-currency redemption fails in PostgreSQL unless an
  active issuer exception exists for the precise card, original denomination
  and merchant checkout currency. No store-wide permission is assumed.
- Only a Super Admin may record or revoke an issuer approval. Verification
  requires an issuer HTTPS terms URL and written evidence about that exact card.
  A human must actually verify the terms; the code does NOT certify any brand.
- Every successful foreign-currency redemption records original card debit,
  merchant checkout denomination, actual merchant-charged amount, and an issuer
  evidence URL. No automatic exchange rate, currency conversion or inferred
  merchant charge is performed.
- Isolated PostgreSQL tests verify default block, exact pair approvals,
  admin-only verification, revocation, zero/overdraw protection, original
  denomination preservation, and immutable transaction history.
- **67/67 JavaScript tests and disposable PostgreSQL CI passed.**
- Sample preview displays separate INR/CAD/USD balances and includes a clearly
  **fictional issuer-approved test card**, not a real merchant policy.
- Interactive preview is in-memory only. It is never a real payment/redemption.

**Not completed:** Live Supabase integration, actual issuer-brand policy research,
actual merchant acceptance verification, production/staging deployment or
scheduled exchange-rate integrations. These are intentionally separate concerns.
The product records eligibility only after a trusted administrator documents
specific issuer evidence, not because another branch or location uses the brand.

## F06 — Barcode / QR display (optional, deferred)

**Priority:** Optional / post-launch enhancement. **Status:** Not implemented.

- Remove F06 from the mandatory MVP and production-readiness gates.
- Do not fabricate payment-accepted barcodes or QR codes from arbitrary
  gift-card numbers; issuer formats and country-specific acceptance matter.
- Revisit only when real users have cards whose issuers provide a legitimate
  barcode/QR format or official scannable image.
- When revisited, prefer exact issuer-provided codes and secured reveal over
  generating an unsupported format. Existing card-number/PIN handling remains.
- No F06 implementation is needed before shipping the core gift-card vault.

## Next development milestone — F05 scanning and capture

Start with safe, optional receipt/card-image intake and extraction of candidate
metadata for user confirmation; never automatically save card numbers, PINs,
balances or currency based on OCR guesses. Prefer on-device processing where
feasible and do not transmit private gift-card codes to unvetted third parties.
Keep backend/database functionality staged until Supabase access is restored.

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
- F04 multi-currency issuer eligibility regression with real Supabase users.
- F05 optional receipt/card scanning and extraction workflow, then family
  isolation, advanced analytics and full Supabase integration tests.
- F06 barcode/QR display remains optional/post-launch, not an MVP blocker.
