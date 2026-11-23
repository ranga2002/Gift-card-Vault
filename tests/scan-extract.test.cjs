'use strict';
const { test }=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const Scan=require('../assets/scan-extract.js');
const file=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('F05 fictional example extracts suggestions without saving',()=>{
 const r=Scan.extract('STORE: Fictional Demo Market\nGIFT CARD BALANCE: CAD 75.00\nVALID UNTIL: 30 Nov 2027\nGIFT CARD NUMBER: DEMO-1234-5678\nPIN: 9999');
 assert.equal(r.merchant.value,'Fictional Demo Market');
 assert.equal(r.amount.value,75);
 assert.equal(r.currency.value,'CAD');
 assert.equal(r.expiry.value,'2027-11-30');
 assert.equal(r.code.value,'DEMO-1234-5678');
 assert.equal(r.pinDetected,true);
 assert.ok(r.warnings.some(s=>/PIN/.test(s)));
});

test('currency is explicit: bare dollar sign is not automatically USD or CAD',()=>{
 const r=Scan.extract('STARBUCKS\nGift Card Balance: $25.00');
 assert.equal(r.amount.value,25);
 assert.equal(r.currency,null);
 assert.match(r.warnings.join(' '),/does not establish/);
});

test('recognizes supported currency symbols and codes without guessing FX',()=>{
 for(const [s,c] of [
  ['GIFT CARD BALANCE ₹1,450.50','INR'],
  ['GIFT CARD BALANCE INR 300','INR'],
  ['GIFT CARD BALANCE CA$35.00','CAD'],
  ['GIFT CARD BALANCE C$12','CAD'],
  ['GIFT CARD BALANCE CAD 125.75','CAD'],
  ['GIFT CARD BALANCE US$40.00','USD'],
  ['GIFT CARD BALANCE USD 100.00','USD']
 ])assert.equal(Scan.extract(s).currency.value,c,s);
});

test('conflicting denominations are never silently resolved',()=>{
 const r=Scan.extract('STORE: Demo\nGift Card Balance: CAD 50\nOther line USD 40');
 assert.equal(r.currency,null);
 assert.match(r.warnings.join(' '),/more than one currency/i);
});

test('safe expiry extraction supports ISO and month names',()=>{
 for(const [raw,expected] of [
  ['EXPIRY: 2027-12-31','2027-12-31'],
  ['EXPIRES: 2028-02-29','2028-02-29'],
  ['VALID UNTIL: 30 Nov 2027','2027-11-30'],
  ['USE BY: November 30, 2027','2027-11-30'],
  ['EXP: 2027-01-05','2027-01-05']
 ])assert.equal(Scan.extract(raw).expiry?.value,expected,raw);
});

test('expiry refuses ambiguous DD/MM vs MM/DD and invalid dates',()=>{
 assert.equal(Scan.parseDate('11/12/2027'),null);
 assert.equal(Scan.parseDate('31/11/2027'),null);
 assert.equal(Scan.parseDate('2027-02-29'),null);
 assert.equal(Scan.parseDate('2028-02-29'),'2028-02-29');
 const r=Scan.extract('EXPIRY: 11/12/2027');
 assert.equal(r.expiry,null);
 assert.ok(r.warnings.some(x=>/ambiguous/.test(x)));
});

test('unambiguous international dates parse without locale guessing',()=>{
 assert.equal(Scan.parseDate('31/12/2027'),'2027-12-31');
 assert.equal(Scan.parseDate('12/31/2027'),'2027-12-31');
 assert.equal(Scan.parseDate('2027/12/31'),'2027-12-31');
});

test('merchant explicit label outranks first-line guess',()=>{
 const r=Scan.extract('Some header\nSTORE: Real Test Shop\nGIFT CARD BALANCE: INR 800');
 assert.equal(r.merchant.value,'Real Test Shop');
 assert.ok(r.merchant.confidence>=.9);
});

test('unlabeled store headings remain low confidence and must be reviewed',()=>{
 const r=Scan.extract('Coffee House\nReceipt\nGIFT CARD BALANCE: INR 75');
 assert.equal(r.merchant.value,'Coffee House');
 assert.ok(r.merchant.confidence<.7);
});

test('a receipt total alone is not a gift card balance',()=>{
 const r=Scan.extract('Store: Fictional Store\nRECEIPT\nTOTAL DUE: CAD 80.00\nTAX: CAD 9.00');
 assert.equal(r.amount,null);
});

test('never treat labeled gift card number or PIN as a monetary balance',()=>{
 const r=Scan.extract('GIFT CARD NUMBER: 1234-5678-9000\nPIN: 1234\nGIFT CARD BALANCE: USD 20');
 assert.equal(r.amount.value,20);
 assert.equal(r.code.value,'1234-5678-9000');
 assert.equal(r.pinDetected,true);
 const only=Scan.extract('GIFT CARD NUMBER: 1234-5678-9000\nPIN: 1234');
 assert.equal(only.amount,null);
});

test('mask sensitive card identifiers and never reveal full code in preview hint',()=>{
 assert.equal(Scan.maskCode('DEMO-1234-5678'),'•••• 5678');
 assert.equal(Scan.maskCode('1234'),'••••');
 assert.equal(Scan.maskCode(''), '••••');
});

test('a generic credit/debit card is not treated as a gift card code',()=>{
 const r=Scan.extract('VISA CREDIT CARD NUMBER: 4111 1111 1111 1111');
 assert.equal(r.code,null);
});

test('empty input does not invent a currency, merchant or amount',()=>{
 const r=Scan.extract('');
 for(const field of ['merchant','amount','expiry','currency','code'])assert.equal(r[field],null);
});

test('OCR text is length limited and does not automatically infer any currency from $',()=>{
 const r=Scan.extract('Gift Card Balance: $12\n'+'.'.repeat(12050));
 assert.ok(r.sourceLength<=12000);
 assert.equal(r.currency,null);
 assert.ok(r.warnings.some(s=>/truncated/.test(s)));
});

test('scan dialog requires explicit consent for enhanced OCR and masks raw code',()=>{
 const ui=file('assets/wallet-scan.js');
 assert.match(ui,/get\("gv-scan-optin"\)\.checked/);
 assert.match(ui,/script\.src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/tesseract\.js\/6\.0\.1\/tesseract\.min\.js"/);
 assert.match(ui,/api\.maskCode\(p\.code\.value\)/);
 assert.match(ui,/result\?\.code&&get\("gv-scan-code-consent"\)\.checked/);
 assert.match(ui,/URL\.revokeObjectURL/);
 assert.match(ui,/MAX_SIZE=8\*1024\*1024/);
 assert.match(ui,/new window\.TextDetector/);
 assert.doesNotMatch(ui,/\.from\("coupons"\)|\.insert\(|localStorage\.setItem|indexedDB\.open/);
 new vm.Script(ui);
});

test('OCR candidates apply to a NEW unsaved card and never to a direct Supabase mutation',()=>{
 const app=file('assets/index.html');
 assert.match(app,/function openGiftCardScan\(\)/);
 assert.match(app,/window\.GiftVaultScan\.open/);
 assert.match(app,/openCouponModal\(\)/);
 assert.match(app,/getElementById\("fExpiry"\)\.value = draft\.expiry \|\| ""/);
 assert.match(app,/getElementById\("fCurrency"\)\.value = draft\.currency \|\| ""/);
 assert.match(app,/draft\.codeConfirmed && draft\.code/);
 assert.match(app,/getElementById\("fCodeVisibility"\)\.value = "private"/);
});

test('preview offers opt-in sample and a second explicit step before saving fake data',()=>{
 const preview=file('preview/functional-wallet.html');
 assert.match(preview,/data-act="scan"/);
 assert.match(preview,/scan:\(\)=>window\.GiftVaultScan\.open/);
 assert.match(preview,/Try fictional example/);
 assert.match(preview,/demo-scan-form/);
 assert.match(preview,/Fictional Demo Market/);
 assert.match(preview,/demo\.cards\.push/);
 assert.match(preview,/code:null,codeConfirmed:false/);
});

test('service worker caches ONLY static scanner code and styling, not images or OCR results',()=>{
 const sw=file('assets/sw.js');
 assert.match(sw,/scan-extract\.js/);
 assert.match(sw,/wallet-scan\.js/);
 assert.match(sw,/wallet-scan\.css/);
 assert.doesNotMatch(sw,/traineddata|scan-result|scan-photo|ocr-output/);
});
