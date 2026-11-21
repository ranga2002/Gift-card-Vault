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
- Smart expiry delivery, multi-currency data, scanning/OCR, barcode/QR display,
  family isolation, advanced analytics and database integration tests.
