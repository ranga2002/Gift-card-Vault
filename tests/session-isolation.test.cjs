'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const app=read('assets/index.html');
function between(start,end){
 const a=app.indexOf(start),b=app.indexOf(end,a+start.length);
 assert.ok(a>=0&&b>a,'anchors: '+start);
 return app.slice(a,b);
}
const globals=between('  let currentUser = null;','  const LOCAL_CFG_KEY = ');
const fetchCode=between('  async function fetchVaultStatus() {','  function canCurrentUserAdd() {');
const profileCode=between('  async function syncCurrentUserFromSession(session) {','  async function handleLoginSubmit(e) {');
const logoutCode=between('  async function logoutCurrentUser() {','  function showMainAppScreen() {');
function defer(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
function chain(p){const q={select(){return q},order(){return q},is(){return q},limit(){return q},
 eq(){return q},maybeSingle(){return p},then(a,b){return p.then(a,b)}};return q;}
function fixture(uid,store){
 const gate=defer();
 const data={
 profiles:[{id:uid,email:uid+'@example.invalid',display_name:uid,role:'contributor',can_read_codes:false,created_at:'2026-11-01'}],
 coupons:[{id:store,store,account:'Personal',benefit_type:'Gift Card / Wallet',amount:20,
 initial_amount:25,currency_code:'CAD',expiry:'2027-01-01',status:'active',created_by:uid,
 code_visibility:'private',has_secret_code:false}],
 coupon_access_requests:[],notifications:[],coupon_transactions:[],coupon_currency_exceptions:[]
 };
 return {gate,data};
}
function mockFetch(){
 const queue=[],renders=[],errors=[];let active;
 const box={window:{GiftVaultScan:{close(){}},walletLiveHandleBack(){}},
 stopNotificationsSync(){},isCurrentUserSuperAdmin(){return false},
 renderAll(){renders.push(true)},setStatusSubtext(){},
 logoutCurrentUser:async()=>{},console:{error(e){errors.push(e)}}};
 box.supabaseClient={from(table){
  if(table==='profiles')active=queue.shift();
  if(!active)throw Error('Missing response batch');
  const f=active;return chain(f.gate.promise.then(()=>({data:f.data[table]||[],error:null})));
 }};
 vm.createContext(box);
 new vm.Script(globals+'\n'+fetchCode+
 '\nthis.api={setUser:u=>{currentUser=u},state:()=>state,fetch:fetchVaultStatus,invalidate:clearAuthenticatedVault};'
 ).runInContext(box);
 return {api:box.api,queue,renders,errors,add(uid,store){const f=fixture(uid,store);queue.push(f);return f}};
}
test('sign out cancels in-flight wallet response before it can update private data',async()=>{
 const h=mockFetch();h.api.setUser({id:'A',role:'contributor'});
 const a=h.add('A','A secret');const p=h.api.fetch();
 h.api.invalidate();a.gate.resolve();await p;
 assert.equal(h.api.state().coupons.length,0);
 assert.equal(h.renders.length,0);
 assert.equal(h.errors.length,0);
});
test('newer same-account refresh wins when older request completes last',async()=>{
 const h=mockFetch();h.api.setUser({id:'A',role:'contributor'});
 const a=h.add('A','old');const p=h.api.fetch();
 const b=h.add('A','new');const q=h.api.fetch();
 b.gate.resolve();await q;a.gate.resolve();await p;
 assert.equal(h.api.state().coupons[0].store,'new');
 assert.equal(h.renders.length,1);
});
test('late results from previous user cannot contaminate next user session',async()=>{
 const h=mockFetch();h.api.setUser({id:'A',role:'contributor'});
 const a=h.add('A','A private');const p=h.api.fetch();
 h.api.invalidate();h.api.setUser({id:'B',role:'contributor'});
 const b=h.add('B','B private');const q=h.api.fetch();
 b.gate.resolve();await q;a.gate.resolve();await p;
 assert.equal(h.api.state().coupons[0].store,'B private');
 assert.equal(h.api.state().members[0].id,'B');
 assert.equal(h.renders.length,1);
});
function mockProfiles(){
 const queue=[],shown=[];
 const box={window:{GiftVaultScan:{close(){}},walletLiveHandleBack(){}},
 stopNotificationsSync(){},showAuthScreen(){},showAuthError(){},showMainAppScreen(){shown.push(true)},
 fetchVaultStatus:async()=>{},pendingInviteToken:null};
 box.supabaseClient={from(table){assert.equal(table,'profiles');return chain(queue.shift().promise)},
 auth:{signOut:async()=>({error:null})}};
 vm.createContext(box);
 new vm.Script(globals+'\n'+profileCode+
 '\nthis.api={sync:syncCurrentUserFromSession,invalidate:clearAuthenticatedVault,user:()=>currentUser};'
 ).runInContext(box);
 return {api:box.api,queue,shown};
}
test('late profile lookup cannot override newer login',async()=>{
 const h=mockProfiles();const a=defer();h.queue.push(a);
 const p=h.api.sync({user:{id:'A'}});
 const b=defer();h.queue.push(b);
 const q=h.api.sync({user:{id:'B'}});
 b.resolve({data:{id:'B',role:'contributor',display_name:'B'},error:null});await q;
 a.resolve({data:{id:'A',role:'contributor',display_name:'A'},error:null});await p;
 assert.equal(h.api.user().id,'B');assert.equal(h.shown.length,1);
});
test('logout while profile lookup is pending never reopens wallet',async()=>{
 const h=mockProfiles(),a=defer();h.queue.push(a);
 const p=h.api.sync({user:{id:'A'}});
 h.api.invalidate();
 a.resolve({data:{id:'A',role:'contributor',display_name:'A'},error:null});await p;
 assert.equal(h.api.user(),null);assert.equal(h.shown.length,0);
});
test('logout scrubs private state synchronously before network sign-out',async()=>{
 const pending=defer();
 const box={window:{GiftVaultScan:{close(){}},walletLiveHandleBack(){}},
 stopNotificationsSync(){},showAuthScreen(){},showAuthError(){}};
 box.supabaseClient={auth:{signOut:()=>pending.promise}};
 vm.createContext(box);
 new vm.Script(globals+'\n'+logoutCode+
 '\nthis.api={logout:logoutCurrentUser,setUser:u=>{currentUser=u},secret:s=>{revealedSecrets={card:s}},state:()=>state,user:()=>currentUser,secrets:()=>revealedSecrets};'
 ).runInContext(box);
 box.api.setUser({id:'A'});box.api.secret('secret');
 const task=box.api.logout();
 assert.equal(box.api.user(),null);assert.equal(Object.keys(box.api.secrets()).length,0);
 assert.equal(box.api.state().coupons.length,0);
 pending.resolve({error:null});await task;
});
test('transaction markup repaired and preview uses exact current wallet code',()=>{
 const wallet=read('assets/wallet-live.js'),preview=read('preview/functional-wallet.html');
 assert.match(wallet,/<div class="wl-ledger"><h3>Transaction history/);
 assert.doesNotMatch(wallet,/<div class="wl-ledger><h3/);
 assert.ok(preview.includes('<script>'+wallet+'</script>'));
 assert.match(wallet,/localeCompare\(b\[0\],undefined,\{sensitivity:"base"\}\)/);
});
test('first-party scripts and main HTML inline script all parse',()=>{
 const names=fs.readdirSync(path.join(__dirname,'..','assets')).filter(n=>n.endsWith('.js')&&!n.includes('config'));
 for(const name of names)assert.doesNotThrow(()=>new vm.Script(read('assets/'+name)),name);
 const mainScript=app.match(/<script>\s*([\s\S]*?)<\/script>/);
 assert.ok(mainScript);
 assert.doesNotThrow(()=>new vm.Script(mainScript[1]));
});
