'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const app=read('assets/index.html');
const sql=read('supabase/migrations/20261120223000_atomic_redemption_history.sql');

function makeHarness(options={}) {
  const first=app.indexOf('let pendingRedemption = null;');
  const last=app.indexOf('async function deleteCoupon(id)',first);
  assert.ok(first>=0&&last>first,'Redemption functions exist');
  const alerts=[],calls=[],buttons=[{disabled:false},{disabled:false},{disabled:false}];
  const fields={
    spendAmountInput:{value:options.amount===undefined?'25':String(options.amount)},
    spendModalInfo:{innerHTML:''},
    spendModalBackdrop:{classList:{visible:false,add(){this.visible=true},remove(){this.visible=false}}}
  };
  const coupon={id:'card1',store:'Test Store',account:'Personal',amount:100,status:'active'};
  let requests=0,refreshes=0;
  const sandbox={
    crypto:{randomUUID:()=>('00000000-0000-4000-8000-'+String(++requests).padStart(12,'0'))},
    selectedSpendId:null,
    state:{coupons:[coupon]},
    canCurrentUserAdd:()=>options.allowed!==false,
    isCouponOwnerOrAdmin:()=>options.owner!==false,
    isCouponActive:c=>c.status==='active'&&c.amount>0,
    document:{
      getElementById:id=>fields[id],
      querySelectorAll:()=>buttons
    },
    escapeHtml:s=>String(s),
    formatINR:n=>String(n),
    alert:s=>alerts.push(String(s)),
    fetchVaultStatus:async()=>{refreshes++},
    supabaseClient:{rpc:async(name,args)=>{
      calls.push({name,args});
      return options.rpc?options.rpc(name,args,calls.length):
        {data:{transaction_id:'tx1',remaining:75},error:null};
    }}
  };
  vm.createContext(sandbox);
  new vm.Script(app.slice(first,last)+'\nthis.actions={openSpendModal,confirmPartialSpend,confirmFullUse};').runInContext(sandbox);
  return {actions:sandbox.actions,calls,alerts,fields,buttons,coupon,refreshes:()=>refreshes};
}

test('migration uses an append-only ledger, RLS and a row lock',()=>{
  assert.match(sql,/create table if not exists public\.coupon_transactions/i);
  assert.match(sql,/references public\.coupons\(id\) on delete restrict/i);
  assert.match(sql,/enable row level security/i);
  assert.match(sql,/revoke all on public\.coupon_transactions from public, anon, authenticated/i);
  assert.match(sql,/grant select on public\.coupon_transactions to authenticated/i);
  assert.match(sql,/coupon_transaction_request_unique unique \(actor_id, request_id\)/i);
  assert.match(sql,/for update\s*;/i);
  assert.match(sql,/create trigger trg_audit_coupon_balance_adjustment/i);
  assert.match(sql,/create trigger trg_guard_coupon_balance_owner/i);
  assert.match(sql,/grant execute on function public\.redeem_coupon\(uuid, numeric, uuid\)/i);
  assert.doesNotMatch(sql,/grant\s+(insert|update|delete)\s+on public\.coupon_transactions to authenticated/i);
});

test('partial redemption calls RPC with intended amount and UUID',async()=>{
  const h=makeHarness();h.actions.openSpendModal('card1');
  await h.actions.confirmPartialSpend();
  assert.equal(h.calls.length,1);
  assert.equal(h.calls[0].name,'redeem_coupon');
  assert.equal(h.calls[0].args.p_coupon_id,'card1');
  assert.equal(h.calls[0].args.p_amount,25);
  assert.match(h.calls[0].args.p_request_id,/^[0-9a-f-]{36}$/);
  assert.equal(h.refreshes(),1);
  assert.equal(h.fields.spendModalBackdrop.classList.visible,false);
});

test('full redemption passes remaining balance to RPC',async()=>{
  const h=makeHarness();h.actions.openSpendModal('card1');
  await h.actions.confirmFullUse();
  assert.equal(h.calls.length,1);
  assert.equal(h.calls[0].args.p_amount,100);
});

test('overspending and invalid fractions fail before RPC',async()=>{
  for(const amount of ['101','0','-1','2.001']) {
    const h=makeHarness({amount});h.actions.openSpendModal('card1');
    await h.actions.confirmPartialSpend();
    assert.equal(h.calls.length,0,'Failed for '+amount);
    assert.ok(h.alerts.length>0);
  }
});

test('non-owner cannot open redemption modal',()=>{
  const h=makeHarness({owner:false});h.actions.openSpendModal('card1');
  assert.equal(h.fields.spendModalBackdrop.classList.visible,false);
  assert.ok(h.alerts.length>0);
});

test('transient RPC error retry uses same idempotency UUID',async()=>{
  const h=makeHarness({rpc:async(_,__,i)=>i===1
    ? {data:null,error:{code:'NETWORK',message:'Retry'}}
    : {data:{transaction_id:'tx2',remaining:75},error:null}});
  h.actions.openSpendModal('card1');
  await h.actions.confirmPartialSpend();
  await h.actions.confirmPartialSpend();
  assert.equal(h.calls.length,2);
  assert.equal(h.calls[0].args.p_request_id,h.calls[1].args.p_request_id);
  assert.equal(h.refreshes(),1);
});

test('duplicate in-flight clicks cause only one RPC',async()=>{
  let resolve;
  const deferred=new Promise(r=>{resolve=r});
  const h=makeHarness({rpc:()=>deferred});
  h.actions.openSpendModal('card1');
  const p=h.actions.confirmPartialSpend();
  const q=h.actions.confirmPartialSpend();
  assert.equal(h.calls.length,1);
  resolve({data:{transaction_id:'tx1',remaining:75},error:null});
  await Promise.all([p,q]);
  assert.equal(h.calls.length,1);
  assert.ok(h.buttons.every(b=>!b.disabled));
});

test('unmigrated database fails closed and never falls back to direct update',async()=>{
  const h=makeHarness({rpc:async()=>({data:null,error:{code:'PGRST202',message:'No function'}})});
  h.actions.openSpendModal('card1');
  await h.actions.confirmPartialSpend();
  assert.equal(h.refreshes(),0);
  assert.match(h.alerts[0],/migration/i);
  const fn=app.slice(app.indexOf('async function redeemSelectedAmount('),app.indexOf('async function deleteCoupon(id)'));
  assert.doesNotMatch(fn,/\.from\("coupons"\)/);
});

test('card history is available in both classic and wallet interfaces',()=>{
  const wallet=read('assets/wallet-live.js');
  assert.match(app,/openRedemptionHistoryModal/);
  assert.match(app,/historyAvailable: state.redemptionsReady/);
  assert.match(wallet,/Transaction history/);
  assert.match(wallet,/historyHtml/);
  assert.match(wallet,/adapter\.canSpend\(id\)/);
});
