# F05 — Gift card / receipt scanner QA and security

## Functional flow

1. Open Gift Vault as a contributor/admin; choose **Scan card / receipt**.
2. Select or photograph an image (JPG/PNG/WebP; HEIC/HEIF only when supported).
3. Choose built-in OCR if the browser supports native TextDetector, or:
   - Choose *Enhanced OCR* only after accepting the third-party-code warning
   - Paste existing recognized text, or
   - Enter the fields manually
4. Review/edit merchant, original currency (INR/CAD/USD), remaining balance,
   and expiry. Do not accept guesses without checking the actual card.
5. A detected card number is masked. Copying it into the existing secret-code
   field is **opt-in**; PINs are never copied automatically.
6. Click **Apply to new card draft**. A new unsaved Add Card form opens.
   It does not auto-save, bypass Supabase RLS, or upload any photo.
7. Re-check field values, account, coupon type, confidentiality and the
   issuer's real terms. Click **Save to Vault** as a separate action.

## Automated and manual acceptance cases

- [x] Synthetic receipt text extracts brand, CAD 75, 2027-11-30 and masked code
- [x] Ambiguous $ symbol does not default to CAD or USD
- [x] Two conflicting currency markers are not silently reconciled
- [x] Ambiguous US/India date formats are not silently guessed
- [x] Credit/debit card data and PIN are not treated as gift-card balances
- [x] Receipt total alone does not become card available balance
- [x] Empty input does not create candidate fields
- [x] JPG/PNG/WebP file intake and max 8 MB guard exist
- [x] Scanner stores no image/OCR text in localStorage/Supabase
- [x] Scanner invalidates outstanding OCR when closed; sign-out scrubs data
- [x] Raw OCR and selected file cleared when scanning ends
- [x] Explicit consent required before Enhanced OCR script download
- [x] Explicit second confirmation in sample-only preview
- [x] Preview sample card only added after review; sample PIN/code discarded
- [ ] Test OCR with actual gift-card and receipt images on Android/iOS/desktop
- [ ] Verify HEIC camera photo decoding where applicable
- [ ] Audit third-party OCR supply chain and consider fully self-hosting
- [ ] Verify browser permissions, slow/offline OCR and accessibility behavior
- [ ] End-to-end signed-in Supabase save and secret visibility regression
- [ ] Verify viewer role cannot access scanner/new card draft
- [ ] Test scanned data as real card only after issuer verification

## Privacy and compatibility

- The app creates a temporary object URL for displaying the local image and
  revokes it. Raw OCR text is held only in the active scanner UI and is cleared
  on close, new scan, or sign-out. This does not prevent operating systems,
  browsers or the user's own device from keeping original photos.
- Native TextDetector support is browser-dependent. For browsers without it,
  the user can enter text manually or opt in to Enhanced OCR.
- Enhanced OCR loads Tesseract.js 6.0.1 from a third-party CDN (cdnjs). Its
  workers and language models may also require remote downloads; loading a
  third-party script means trusting it with the photo. The application does
  not itself transmit scanned images to Supabase or an OCR API.
- No claim is made that a detected code is usable or that OCR proves
  denomination, expiry, balance or a merchant's cross-border acceptance.
  F04 original-currency and issuer-approval restrictions continue to apply.
- The scanner does NOT support PDF uploads or barcode/QR payment generation;
  F06 remains optional.
- All live backend behavior remains blocked pending Supabase staging access.

## Implementation files

- \`assets/scan-extract.js\` — pure, conservative OCR text parser
- \`assets/wallet-scan.js\` — camera/image intake, OCR, review and cancellation
- \`assets/wallet-scan.css\` — responsive scanner UI
- \`assets/index.html\` — authenticated Add Card draft integration
- \`assets/wallet-live.js\` — wallet scanning entry point
- \`tests/scan-extract.test.cjs\` — F05 regression tests
- \`preview/functional-wallet.html\` — synthetic review flow
