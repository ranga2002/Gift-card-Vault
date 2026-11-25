# F04 — Currency denomination and issuer rule QA

## Mandatory rule

A gift card denominated in INR, CAD or USD must **not** be recorded as
redeemed in any other checkout currency by default. A **card-specific** issuer
exception can only be recorded by a Super Admin after reading the exact brand/
card product/region's official terms and providing a suitable issuer HTTPS
evidence URL and note. No name-based global whitelist and **no default FX**.

Example: A CAD $100 card with no issuer-verified USD eligibility:
- CAD 20 checkout may deduct CAD 20.
- USD 20 checkout is **blocked**, even if the merchant has locations in the US.
- Merely setting the currency selector to USD does NOT convert or authorize it.

A fictional issuer-approved CAD-to-USD example:
- The card starts with CA$80.
- Merchant-confirmed checkout USD 7.44, original card debit CAD 10.
- Remaining card balance is **CA$70**, not US$70.
- History records debit CAD 10, merchant charge USD 7.44, and issuer evidence.

## QA checklist

- [ ] Select INR/CAD/USD when creating a card. Changing denomination on edit is refused.
- [ ] Existing cards are assigned INR by migration. Validate legacy data.
- [ ] Cross-currency merchant checkout blocked by default at UI **and SQL**.
- [ ] Other cards from same brand are NOT granted permission by association.
- [ ] Viewer/contributor cannot insert or modify issuer exceptions directly.
- [ ] Only Super Admin can approve/revoke an exception with issuer URL + note.
- [ ] Evidence must match exact card, original currency, merchant currency,
      product and region. Verify issuer evidence manually.
- [ ] Expired/revoked exception blocks new foreign checkout.
- [ ] User must provide **actual merchant-charge amount**; app never guesses FX.
- [ ] Same-currency checkout amount equals original card debit.
- [ ] Atomic RPC ledger stores original currency, target currency, actual
      settlement amount and source issuer evidence.
- [ ] No 3-argument old redemption RPC remains callable after F04.
- [ ] Partial/full spend maintains original denomination.
- [ ] Idempotent retries prevent duplicate deductions.
- [ ] Wallet, analytics, classic manager, transaction logs and alert summaries
      never add INR, CAD, USD into a fictitious combined number.
- [ ] Balance filtering and ordering in a mixed wallet selects one currency.
- [ ] Import preserves valid denomination and treats legacy missing currency as INR.
- [ ] Staging Supabase auth, RLS and historical migration order verified.

## Files

- `assets/wallet-currency.js` (pure formatter/rule validator)
- `assets/index.html` (add/edit, admin verification, atomic spend adapter)
- `assets/wallet-live.js` (native balance and approval notes)
- `assets/wallet-filter-engine.js` (currency filters)
- `supabase/migrations/20261122234500_currency_issuer_redemption_guard.sql`
- `tests/currency-safety.test.cjs`
- `tests/db/f04_currency_integration.sql`

## Status / caveats

Node and isolated PostgreSQL CI passed; **the F04 migration has NOT been
applied to a real Supabase staging or production database**. Do not merge
or deploy without staging verification and manual review of historical cards.
Admin-supplied issuer evidence is a record of human verification, not a live
issuer integration. The user still must confirm real-world acceptance at the
merchant and applicable fees or restrictions.

The interactive preview uses fictional sample cards and approvals ONLY.
