# Gift Vault enhancement rollout

This branch is a review/staging branch, not a production deployment. The initial tasks are: UI refresh, search/filter improvements, calendar code privacy, PWA shell, and security stabilization.

## Deployment safeguards

- Do not deploy database-dependent frontend features until migrations have been applied and verified on a staging Supabase project.
- Protect card redemption codes from logs, calendar URLs and offline caches.
- The existing legacy Node.js server contains insecure authentication; do not publicly expose it.
- Run manual regression tests for sign-in, invitations, CRUD, private-code access, and balance updates before merging.

## Remaining scoped work

Automated expiry email delivery, auditable redemption ledger, currency migration, photo scanning, barcode and QR rendering, family vault isolation, full analytics, and automated integration tests require additional implementation and staging validation.
