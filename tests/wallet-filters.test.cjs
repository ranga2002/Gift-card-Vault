'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const api=require('../assets/wallet-filter-engine.js');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const NOW=new Date(2026,10,21,12);
const cards=[
{id:'a1',store:'Starbucks',account:'Personal',type:'Gift Card / Wallet',amount:25,notes:'Latte voucher',status:'active',expiry:'2026-11-25',createdAt:'2026-10-01T10:00:00Z',secret_code:'hidden-apple'},
{id:'a2',store:'Amazon',account:'Personal',type:'Gift Card / Wallet',amount:150,notes:'Gift for the holidays',status:'active',expiry:'2026-12-20',createdAt:'2026-10-20T10:00:00Z'},
{id:'a3',store:'Walmart',account:'Family',type:'Gift Card / Wallet',amount:80,notes:'Groceries',status:'active',expiry:'2026-11-23',createdAt:'2026-10-04T10:00:00Z'},
{id:'a4',store:'Indigo',account:'Personal',type:'Gift Card / Wallet',amount:0,notes:'Already spent',status:'used',expiry:'2026-11-18',createdAt:'2026-09-01T10:00:00Z'},
{id:'a5',store:'Sephora',account:'Personal',type:'Gift Card / Wallet',amount:25,notes:'Unused',status:'active',expiry:'2026-11-19',createdAt:'2026-08-22T10:00:00Z'},
{id:'a6',store:'PRESTO',account:'Transit',type:'Transit',amount:55,notes:'Commuting',status:'active',expiry:null,createdAt:'2026-11-01T10:00:00Z'},
{id:'a7',store:'Café Amore',account:'Family',type:'Voucher',amount:12.50,notes:'Coffee',status:'active',expiry:'2026-12-01',createdAt:'2026-09-11T10:00:00Z'}
];
const ids=(f)=>api.filter(cards,f,NOW).map(c=>c.id);
test('default view includes only currently active, positive-balance cards',()=>{
 assert.deepEqual(ids({}),['a3','a1','a7','a2','a6']);
});
test('all, used and expired statuses distinguish zero balance from past expiry',()=>{
 assert.deepEqual(ids({status:'used'}),['a4']);
 assert.deepEqual(ids({status:'expired'}),['a5']);
 assert.equal(ids({status:'all'}).length,cards.length);
 assert.equal(api.statusOf(cards[5],NOW),'active');
 assert.equal(api.statusOf(cards[4],NOW),'expired');
});
test('merchant, account and type filters combine with exact membership',()=>{
 assert.deepEqual(ids({store:'Starbucks'}),['a1']);
 assert.deepEqual(ids({account:'Family',type:'Voucher'}),['a7']);
 assert.deepEqual(ids({status:'all',account:'Personal'}),['a4','a5','a1','a2']);
 assert.deepEqual(ids({account:'Transit',type:'Transit'}),['a6']);
});
test('search ignores case, supports notes and diacritics',()=>{
 assert.deepEqual(ids({query:'LATTE'}),['a1']);
 assert.deepEqual(ids({query:'GROCERIES'}),['a3']);
 assert.deepEqual(ids({query:'cafe'}),['a7']);
 assert.deepEqual(ids({query:'family'}),['a3','a7']);
});
test('search never indexes private card secrets or internal card ID',()=>{
 assert.equal(ids({query:'hidden-apple'}).length,0);
 assert.equal(ids({query:'a1'}).length,0);
});
test('expiry windows handle no-expiry, overdue and upcoming boundaries',()=>{
 assert.deepEqual(ids({expiry:'7'}),['a3','a1']);
 assert.deepEqual(ids({expiry:'14'}),['a3','a1','a7']);
 assert.deepEqual(ids({expiry:'30'}),['a3','a1','a7','a2']);
 assert.deepEqual(ids({expiry:'none'}),['a6']);
 assert.deepEqual(ids({status:'all',expiry:'expired'}),['a4','a5']);
});
test('balance min and max are inclusive, and zero balances can be queried',()=>{
 assert.deepEqual(ids({minBalance:'25',maxBalance:'80'}),['a3','a1','a6']);
 assert.deepEqual(ids({status:'all',maxBalance:'0'}),['a4']);
 assert.deepEqual(ids({minBalance:'200'}),[]);
});
test('combined query + status + account + expiry + balance + sorting',()=>{
 assert.deepEqual(ids({query:'gift',status:'active',account:'Personal',expiry:'30',minBalance:'20',maxBalance:'160',sort:'balance-desc'}),['a2']);
 assert.deepEqual(ids({store:'Walmart',account:'Personal'}),[]);
});
test('sort balance ascending and descending is stable and nonmutating',()=>{
 const original=cards.map(c=>c.id).join('|');
 assert.deepEqual(ids({sort:'balance-desc'}),['a2','a3','a6','a1','a7']);
 assert.deepEqual(ids({sort:'balance-asc'}),['a7','a1','a6','a3','a2']);
 assert.equal(cards.map(c=>c.id).join('|'),original);
});
test('alphabetical and recent sorts use public metadata fields',()=>{
 assert.deepEqual(ids({sort:'store-asc'}),['a2','a7','a6','a1','a3']);
 assert.deepEqual(ids({sort:'store-desc'}),['a3','a1','a6','a7','a2']);
 assert.equal(ids({sort:'newest'})[0],'a6');
 assert.equal(ids({sort:'account-asc'})[0],'a7');
});
test('expiry sorting puts cards without expiry date last',()=>{
 assert.equal(ids({sort:'expiry-asc'}).at(-1),'a6');
 assert.equal(ids({sort:'expiry-desc'}).at(-1),'a6');
});
test('invalid filters normalize safely to sensible defaults',()=>{
 const p=api.normalize({status:'hacked',sort:'bogus',expiry:'yesterday',minBalance:'-1',maxBalance:'NaN',query:' A '.repeat(150)});
 assert.equal(p.status,'active');assert.equal(p.sort,'expiry-asc');assert.equal(p.expiry,'any');
 assert.equal(p.minBalance,'');assert.equal(p.maxBalance,'');
 assert.ok(p.query.length<=180);
 assert.deepEqual(api.filter(cards,{sort:'hacked'},NOW).map(x=>x.id),ids({}));
});
test('day math uses local calendar date and validates date components',()=>{
 assert.equal(api.days('2026-11-21',new Date(2026,10,21,23)),0);
 assert.equal(api.days('2026-11-22',new Date(2026,10,21,23)),1);
 assert.equal(api.days('2026-02-31',NOW),null);
 assert.equal(api.days(null,NOW),null);
 assert.equal(api.days('2026-03-09',new Date(2026,2,7,23)),2);
});
test('option lists include only unique distinct metadata from current permitted cards',()=>{
 assert.deepEqual(api.options(cards).accounts,['Family','Personal','Transit']);
 assert.deepEqual(api.options(cards).types,['Gift Card / Wallet','Transit','Voucher']);
 assert.equal(api.options(cards).stores.length,7);
});
test('active filter badge counts modifications and reset clears them',()=>{
 assert.equal(api.activeCount(api.defaults()),0);
 assert.equal(api.activeCount({store:'Starbucks',status:'all',sort:'balance-desc',query:'latte'}),4);
 assert.equal(api.activeCount({status:'active',sort:'expiry-asc'}),0);
});
test('signed-in wallet UI has functional filter controls and scoped reset',()=>{
 const html=read('assets/index.html');
 const wallet=read('assets/wallet-live.js');
 const sw=read('assets/sw.js');
 const preview=read('preview/functional-wallet.html');
 assert.match(html,/wallet-filter-engine\.js/);
 assert.match(html,/wallet-filters\.css/);
 assert.match(wallet,/filterApi\.filter\(s\.cards,filters\)/);
 assert.match(wallet,/id="wl-filter-panel"/);
 assert.match(wallet,/data-act="toggle-filters"/);
 assert.match(wallet,/data-act="reset-filters"/);
 assert.match(wallet,/wl-filter-minBalance/);
 assert.match(wallet,/lastAccount!==s\.user\.id/);
 assert.match(wallet,/status:"all"/);
 assert.match(preview,/Tim Hortons/);
 assert.match(preview,/wallet-filter-engine\.js|F03: pure in-memory filtering/);
 assert.match(sw,/wallet-filter-engine\.js/);
 new vm.Script(read('assets/wallet-filter-engine.js'));
 new vm.Script(wallet);
});
