# F03 — Wallet search and filters QA

**Scope:** UI and pure in-memory filtering engine. No Supabase changes.

## Test checklist
- [ ] Search store names, accounts, card types and notes; case insensitive.
- [ ] Search ignores redemption codes and hidden secrets.
- [ ] Exact store, account and card type selections work independently.
- [ ] Combine text, merchant, account, type, status, expiry and balance ranges.
- [ ] Active excludes fully used and expired cards; Used and Expired lists differ.
- [ ] All statuses includes active, used and expired card records.
- [ ] Expiry windows handle 7, 14 and 30 days inclusively.
- [ ] No-expiry cards appear in the no-expiry filter and sort last.
- [ ] Minimum/maximum INR balance filters are inclusive and combined.
- [ ] Sorting by expiry, balance, store name, account and date added works.
- [ ] Clear all restores the Active + expiry-soonest defaults.
- [ ] Empty matches show a clear reset path.
- [ ] Search and filters work on narrow mobile screens.
- [ ] Switching account resets filter state, without persisting card metadata.
- [ ] Expiring and History tabs still show the correct card subsets.
- [ ] Card detail, private-code protections, reminders and spending still work.
- [ ] Classic management screen and all F07/F02 tests remain unaffected.

## Implementation
- assets/wallet-filter-engine.js: pure public-metadata filter and sorting logic.
- assets/wallet-live.js: controls, result counts and views.
- assets/wallet-filters.css: responsive styling.
- tests/wallet-filters.test.cjs: 16 focused Node tests.
- preview/functional-wallet.html: sample-only interactive page.

**Deployment gate:** existing F07 SQL and account security require Supabase
staging validation when access becomes available. F03 has no database changes
and does not provide server-side search or pagination.
