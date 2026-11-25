'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const engine=require('../assets/expiry-reminders.js');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const today=new Date(2026,10,21,12);
const makeDate=d=>{const t=new Date(2026,10,21,12);t.setDate(t.getDate()+d);return engine.dateKey(t)};
const card=(days,id='abc-123',extra={})=>({id,store:'Demo Shop',account:'Personal',amount:125,status:'active',expiry:makeDate(days),...extra});
const alerts=(cards,prefs=engine.defaultState(),date=today)=>engine.evaluate(cards,prefs,date);

test('default reminders cover 30, 15, 7, 3, 1 day, due today and expired',()=>{
 for (const stage of [30,15,7,3,1]) {
  const x=alerts([card(stage)])[0];
  assert.equal(x.stage,String(stage));
  assert.equal(x.days,stage);
 }
 assert.equal(alerts([card(31)]).length,0);
 assert.equal(alerts([card(0)])[0].stage,'today');
 assert.equal(alerts([card(-1)])[0].stage,'expired');
});

test('only most urgent relevant threshold is shown, not 5 duplicates',()=>{
 const x=alerts([card(2)]);
 assert.equal(x.length,1);
 assert.equal(x[0].stage,'3');
 assert.equal(x[0].level,'urgent');
 assert.equal(alerts([card(12)])[0].stage,'15');
});

test('date calculations are local calendar-day based across DST and year change',()=>{
 assert.equal(engine.daysUntil('2027-01-01',new Date(2026,11,31,23,50)),1);
 assert.equal(engine.daysUntil('2027-01-01',new Date(2027,0,1,0,1)),0);
 assert.equal(engine.daysUntil('2026-03-09',new Date(2026,2,7,23)),2);
 assert.equal(engine.daysUntil('2026-02-30',today),null);
 assert.equal(engine.daysUntil('',today),null);
});

test('ignore used, empty, invalid and unexpired-away cards',()=>{
 const cards=[card(3,'used',{status:'used'}),card(3,'empty',{amount:0}),card(3,'bad',{expiry:'not-a-date'}),card(40,'far')];
 assert.equal(alerts(cards).length,0);
});

test('global pause and per-card pause suppress reminders',()=>{
 let prefs=engine.setEnabled(engine.defaultState(),false);
 assert.equal(alerts([card(2)],prefs).length,0);
 prefs=engine.setCardEnabled(engine.defaultState(),'abc-123',false);
 assert.equal(alerts([card(2)],prefs).length,0);
 assert.equal(alerts([card(2,'another-card')],prefs).length,1);
});

test('global timing changes and per-card overrides are respected',()=>{
 let prefs=engine.defaultState();
 prefs=engine.setThreshold(prefs,30,false);
 prefs=engine.setThreshold(prefs,15,false);
 assert.deepEqual(prefs.thresholds,[7,3,1]);
 assert.equal(alerts([card(12)],prefs).length,0);
 prefs=engine.setCardSchedule(prefs,'abc-123',[15,1]);
 assert.equal(alerts([card(12)],prefs)[0].stage,'15');
 prefs=engine.setCardSchedule(prefs,'abc-123',null);
 assert.equal(alerts([card(12)],prefs).length,0);
});

test('mark read updates the unread badge without hiding the reminder',()=>{
 const a=alerts([card(3)])[0];
 const prefs=engine.act(engine.defaultState(),a,'read',today);
 const visible=alerts([card(3)],prefs);
 assert.equal(visible.length,1);
 assert.equal(visible[0].unread,false);
 assert.equal(prefs.history[0].action,'read');
});

test('dismissing current milestone does not silence a later more urgent milestone',()=>{
 const a=alerts([card(7)])[0];
 const prefs=engine.act(engine.defaultState(),a,'dismissed',today);
 assert.equal(alerts([card(7)],prefs).length,0);
 assert.equal(alerts([card(3)],prefs).length,1);
});

test('snooze postpones alert until the following local calendar day',()=>{
 const a=alerts([card(3)])[0];
 const prefs=engine.act(engine.defaultState(),a,'snoozed',today);
 assert.equal(alerts([card(3)],prefs).length,0);
 const tomorrow=new Date(2026,10,22,12);
 const stillThreeDaysAway=card(3); // same expiry as before: now 2 days left
 assert.equal(alerts([stillThreeDaysAway],prefs,tomorrow).length,1);
 assert.equal(prefs.actions[a.id].until,'2026-11-22');
});

test('changing a card expiry creates a new alert rather than inheriting old dismissal',()=>{
 const a=alerts([card(3)])[0];
 const prefs=engine.act(engine.defaultState(),a,'dismissed',today);
 assert.equal(alerts([card(3)],prefs).length,0);
 assert.equal(alerts([card(4)],prefs).length,1);
});

test('device storage is isolated by account and contains no card codes or balances',()=>{
 const cache=new Map();
 const storage={getItem:k=>cache.get(k)||null,setItem:(k,v)=>cache.set(k,v)};
 const p=engine.act(engine.defaultState(),alerts([card(3)])[0],'dismissed',today);
 assert.equal(engine.save(storage,'user-aaaaa',p),true);
 assert.equal(engine.load(storage,'user-aaaaa').history.length,1);
 assert.equal(engine.load(storage,'user-bbbbb').history.length,0);
 const content=cache.values().next().value;
 assert.doesNotMatch(content,/Demo Shop|125|redemption|secret_code|coupon_code/);
 assert.match([...cache.keys()][0],/^gift-vault:expiry:v1:user-aaaaa$/);
});

test('localStorage unavailable or corrupt falls back safely',()=>{
 assert.equal(engine.load({getItem:()=>'{broken'},'user-a').enabled,true);
 assert.equal(engine.save({setItem:()=>{throw Error('disabled')}},'user-a',engine.defaultState()),false);
 assert.deepEqual(engine.normalize({thresholds:[999,30,15,3,3]}).thresholds,[30,15,3]);
});

test('UI and service worker reference only same-origin expiry scripts and styles',()=>{
 const app=read('assets/index.html');
 const wallet=read('assets/wallet-live.js');
 const ui=read('assets/wallet-expiry-ui.js');
 const sw=read('assets/sw.js');
 const preview=read('preview/functional-wallet.html');
 new vm.Script(read('assets/expiry-reminders.js'));
 new vm.Script(ui);
 assert.match(app,/expiry-reminders\.js/);
 assert.match(app,/wallet-expiry-ui\.js/);
 assert.match(app,/wallet-expiry-ui\.css/);
 assert.match(app,/user:\s*\{\s*id: currentUser\.id/);
 assert.match(wallet,/walletExpiryOpenCenter/);
 assert.match(wallet,/walletExpiryOpenCardSettings/);
 assert.match(ui,/window\.walletExpiryOpenCenter=center/);
 assert.match(ui,/setInterval\(/);
 assert.match(ui,/api\.load\(store\(\),userId\)/);
 assert.match(ui,/data-expiry-action="snoozed"/);
 assert.match(preview,/plusDays\(3\)/);
 for(const file of ['expiry-reminders.js','wallet-expiry-ui.js','wallet-expiry-ui.css'])assert.ok(sw.includes(file));
 assert.doesNotMatch(ui,/\.from\("|service_role|sb_secret_|Notification\.requestPermission|showNotification/);
});
