'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const C=require('../assets/wallet-currency.js');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const card={id:'cad-card',store:'Synthetic Merchant',currency:'CAD',amount:100};
const now=new Date(2026,10,22,12);
const evidence={couponId:'cad-card',sourceCurrency:'CAD',targetCurrency:'USD',active:true,
  verifiedBy:'test-admin',evidenceUrl:'https://issuer.example/terms',validUntil:'2027-01-01'};
test('supports exactly INR/CAD/USD ISO denominations',()=>{
 assert.deepEqual([...C.CURRENCIES],['INR','CAD','USD']);
 for(const c of C.CURRENCIES)assert.equal(C.code(c),c);
 assert.equal(C.code('EUR'),null);
 assert.equal(C.code('usd'),null);
});
test('money display differentiates Canadian, American and Indian currency labels',()=>{
 assert.match(C.format(12.5,'INR'),/₹12\.50/);
 assert.match(C.format(12.5,'CAD'),/CA\$/);
 assert.match(C.format(12.5,'USD'),/US\$/);
});
test('separate per-currency balances without implicit conversion or mixing',()=>{
 const cards=[{amount:100,currency:'INR'},{amount:50,currency:'CAD'},{amount:75,currency:'USD'},{amount:5,currency:'CAD'}];
 assert.deepEqual(C.totals(cards),{INR:100,CAD:55,USD:75});
 const summary=C.summary(cards);
 for(const token of ['INR','CAD','USD'])assert.ok(summary.includes(token));
 assert.equal(C.summary([]),'No balance');
});
test('legacy balances map to INR only, never assume CAD',()=>{
 assert.equal(C.cardCurrency({currency:'INR'}),'INR');
 assert.equal(C.cardCurrency({}),'INR');
 assert.equal(C.format(10,null),C.format(10,'INR'));
});
test('same-currency redemption permits exact card denomination only',()=>{
 const p=C.validate(card,'CAD',20,null,[],now);
 assert.equal(p.ok,true);
 assert.equal(p.cardDebit,20);assert.equal(p.chargedAmount,20);
 assert.equal(p.exception,false);
 assert.equal(C.validate(card,'CAD',20,21,[],now).ok,false);
});
test('unapproved cross-currency use is blocked even when a merchant is globally available',()=>{
 const p=C.validate(card,'USD',20,15,[],now);
 assert.equal(p.ok,false);
 assert.match(p.message,/blocked/i);
 assert.equal(C.validate(card,'INR',10,500,[],now).ok,false);
});
test('exception must match exact card, source and settlement currency',()=>{
 const permission=[evidence];
 assert.equal(C.validate({...card,id:'different-card'},'USD',10,7,permission,now).ok,false);
 assert.equal(C.validate({...card,currency:'INR'},'USD',10,7,permission,now).ok,false);
 assert.equal(C.validate(card,'INR',10,700,permission,now).ok,false);
 assert.equal(C.validate(card,'USD',10,7,permission,now).ok,true);
});
test('cross-currency exception needs issuer proof, admin verifier and active state',()=>{
 assert.equal(C.approvedFor(card,'USD',[{...evidence,active:false}],now),null);
 assert.equal(C.approvedFor(card,'USD',[{...evidence,evidenceUrl:'http://issuer.example'}],now),null);
 assert.equal(C.approvedFor(card,'USD',[{...evidence,verifiedBy:null}],now),null);
 assert.equal(C.approvedFor(card,'USD',[{...evidence,validUntil:'2026-01-01'}],now),null);
 assert.equal(C.approvedFor(card,'USD',[evidence],now).targetCurrency,'USD');
});
test('issuer-approved exception requires real merchant charge; no FX guess',()=>{
 assert.equal(C.validate(card,'USD',10,null,[evidence],now).ok,false);
 assert.equal(C.validate(card,'USD',10,'',[evidence],now).ok,false);
 const x=C.validate(card,'USD',10,7.44,[evidence],now);
 assert.equal(x.ok,true);assert.equal(x.source,'CAD');
 assert.equal(x.target,'USD');assert.equal(x.cardDebit,10);assert.equal(x.chargedAmount,7.44);
});
test('reject invalid debit, excessive amount, non-cent precision and invalid target',()=>{
 assert.equal(C.validate(card,'CAD',0,null,[],now).ok,false);
 assert.equal(C.validate(card,'CAD',101,null,[],now).ok,false);
 assert.equal(C.validate(card,'CAD',1.001,null,[],now).ok,false);
 assert.equal(C.validate(card,'XYZ',10,null,[],now).ok,false);
 assert.equal(C.validate(card,'USD',10,7.123,[evidence],now).ok,false);
});
test('issuer permission record is card-specific and cannot be forged by UI metadata',()=>{
 const sql=read('supabase/migrations/20261122234500_currency_issuer_redemption_guard.sql');
 assert.match(sql,/create table if not exists public\.coupon_currency_exceptions/i);
 assert.match(sql,/revoke all on public\.coupon_currency_exceptions from public, anon, authenticated/i);
 assert.match(sql,/v_role is distinct from 'super_admin'/i);
 assert.match(sql,/p_evidence_url !~\*/i);
 assert.match(sql,/drop function if exists public\.redeem_coupon\(uuid,numeric,uuid\)/i);
 assert.match(sql,/p_spend_currency text,p_settlement_amount numeric/i);
 assert.match(sql,/if p_spend_currency=v_currency then/i);
 assert.match(sql,/for share/i);
 assert.match(sql,/source_currency=v_currency/i);
 assert.match(sql,/issuer_evidence_url/i);
 assert.match(sql,/create trigger trg_protect_coupon_currency/i);
});
test('card currency cannot be edited after creation in SQL or classic form',()=>{
 const sql=read('supabase/migrations/20261122234500_currency_issuer_redemption_guard.sql');
 const app=read('assets/index.html');
 assert.match(sql,/new\.currency_code is distinct from old\.currency_code/i);
 assert.match(app,/id="fCurrency"/);
 assert.match(app,/getElementById\("fCurrency"\)\.disabled = true/);
 assert.match(app,/existing\.currency !== currency/);
 assert.match(app,/currency_code: currency/);
});
test('transaction RPC always submits card and merchant currencies and actual amount',()=>{
 const app=read('assets/index.html');
 assert.match(app,/p_spend_currency:intent\.target/);
 assert.match(app,/p_settlement_amount:intent\.merchantAmount/);
 assert.match(app,/window\.GiftVaultCurrency\.validate/);
 assert.match(app,/approve_coupon_currency_exception/);
 assert.match(app,/revoke_coupon_currency_exception/);
 assert.match(app,/issuer.*official terms/i);
});
test('multi-currency UI does not combine balances into a phantom grand total',()=>{
 const wallet=read('assets/wallet-live.js');
 const app=read('assets/index.html');
 assert.match(wallet,/function walletTotals\(cs\)\{return currencyApi\.summary\(cs\)/);
 assert.match(app,/function balanceSummary\(cards\)/);
 assert.match(wallet,/id="wl-filter-currency"/);
 assert.match(wallet,/Select one card currency before comparing balances/);
 assert.match(read('assets/wallet-filter-engine.js'),/f\.currency!=="all"/);
});
test('F04 DB integration is chained after F07 lock and concurrency tests',()=>{
 const ci=read('.github/workflows/db-integration.yml');
 const p=ci.indexOf('f07_concurrency.sh');
 const q=ci.indexOf('20261122234500_currency_issuer_redemption_guard.sql');
 const r=ci.indexOf('f04_currency_integration.sql');
 assert.ok(p>=0&&q>p&&r>q);
 assert.match(read('tests/db/f04_currency_integration.sql'),/FICTIONAL TEST ONLY/);
});
