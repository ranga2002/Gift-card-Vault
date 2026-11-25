# F12 — Reliability, Security Boundaries and QA

## Completed in feature-branch code

| Case | Expected behavior |
|---|---|
| Sign out while coupons are loading | In-memory wallet state is cleared immediately; delayed response ignored |
| Sign out during profile lookup | Old lookup cannot authenticate/reopen wallet |
| Start login A then login B; A returns last | Only B becomes active |
| Fetch A, switch to B; A completes afterward | Only B's cards/roles can be assigned |
| Start two refreshes for same user; oldest completes last | Newer result remains displayed |
| Network sign-out slow | Local secrets and cached wallet state are already reset |
| Scan in progress during logout | Scanner image/draft and object URL are discarded |
| Transaction history card detail | Correct HTML container; card details remain readable |
| Merchant group ordering with multiple currencies | Group alphabetically; no cross-currency ranking or invented exchange rates |
| Main app scripts | Parse in Node's JS engine |
| Sample preview wallet script | Matches the tested production wallet module exactly |
| F07/F04 PostgreSQL regression | Still passes isolated SQL tests |

Automated checks: `tests/session-isolation.test.cjs` plus existing
`tests/*.test.cjs`; GitHub Actions runs Node 22 on pushes and pull requests.

## Explicit release blockers

- No access to actual Supabase staging has been provided.
- Validate user switching, authentication, logout and token-refresh timing in
  an actual browser connected to an isolated staging Supabase project.
- Audit the original RLS migrations, grant policies, private-code visibility,
  role boundaries, and issuer-specific currency exceptions as a complete system.
- Check scanner OCR privacy policy, real camera/HEIC support, mobile accessibility,
  and third-party script use before release.
- Verify save/update/delete/transaction history behaviors, including
  transaction-retaining archives and long histories with pagination.
- Keep draft PR unmerged until user-directed deployment readiness is verified.
- F11 analytics remains skipped; F06 barcode/QR remains optional.

No production database or live app was changed.
