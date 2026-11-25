/* F02 in-app expiry alerts. No email, push, service worker notifications or network writes.
 * Only reminder preferences + acknowledgement IDs live in per-account localStorage.
 * Merchant names, balances and redemption codes are never written to that storage. */
(function(){
"use strict";
const $=id=>document.getElementById(id);
const api=window.GiftVaultExpiry;
if(!api){console.error("Expiry reminder engine was not loaded");return;}
const store=()=>{try{return window.localStorage;}catch{return null;}};
const esc=x=>String(x==null?"":x).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const currency=(n,cur)=>window.GiftVaultCurrency?window.GiftVaultCurrency.format(n,cur||"INR"):String(n)+" "+(cur||"INR");
let mounted=false,userId=null,settings=api.defaultState(),alerts=[],lastSnapshot=null,cardId=null;
const statusText=a=>a.days<0?"Expired "+Math.abs(a.days)+" day"+(a.days===-1?"":"s")+" ago":a.days===0?"Expires today":a.days===1?"Expires tomorrow":"Expires in "+a.days+" days";
const stageText=stage=>stage==="today"?"Expiry day":stage==="expired"?"Expired":stage+"-day reminder";
function data(){return window.giftVaultLiveBridge?.snapshot?.()||null;}
function ensureAccount(){
  const snap=data();
  if(!snap||!snap.user||!api.scope(snap.user.id)){lastSnapshot=null;userId=null;settings=api.defaultState();alerts=[];return null;}
  if(snap.user.id!==userId){userId=snap.user.id;settings=api.load(store(),userId);}
  lastSnapshot=snap;
  return snap;
}
function persist(){if(userId)api.save(store(),userId,settings);}
function evaluate(){const s=ensureAccount();alerts=s?api.evaluate(s.cards,settings):[];return s;}
function allAlertMarkup(a){
  return '<article class="wl-alert-item '+a.level+'">'+
   '<div class="wl-alert-head"><div class="wl-alert-text"><span class="wl-alert-severity">'+(a.days<=0?"Action needed":a.days<=3?"Urgent":a.days<=7?"Soon":"Upcoming")+'</span>'+
   '<strong>'+esc(a.store)+'</strong><small>'+esc(statusText(a))+' · '+currency(a.amount,a.currency)+'</small></div>'+
   (a.unread?'<span class="wl-alert-dot" aria-label="Unread reminder"></span>':'<span class="wl-alert-seen">Read</span>')+'</div>'+
   '<div class="wl-alert-actions"><button type="button" data-expiry-action="open" data-alert="'+esc(a.id)+'">View card</button>'+
   (a.unread?'<button type="button" data-expiry-action="read" data-alert="'+esc(a.id)+'">Mark read</button>':'')+
   '<button type="button" data-expiry-action="snoozed" data-alert="'+esc(a.id)+'">Snooze 1 day</button>'+
   '<button type="button" data-expiry-action="dismissed" data-alert="'+esc(a.id)+'">Dismiss</button></div></article>';
}
function historyMarkup(h){
  const card=lastSnapshot?.cards.find(c=>c.id===h.cardId);
  const label=h.action==="read"?"Marked read":h.action==="dismissed"?"Dismissed":"Snoozed";
  let when="";
  const dt=new Date(h.at);
  if(!Number.isNaN(+dt))when=dt.toLocaleDateString("en-CA",{month:"short",day:"numeric",year:"numeric"});
  return '<div class="wl-alert-history-row"><span><strong>'+label+'</strong> · '+esc(card?.store||"Removed card")+
    '<small>'+esc(stageText(h.stage))+(when?" · "+esc(when):"")+'</small></span></div>';
}
function thresholdOptions(selected,prefix,disabled){
  return api.STEPS.map(d=>'<label class="wl-alert-option"><input type="checkbox" data-'+prefix+'="'+d+'" '+(selected.includes(d)?"checked ":"")+(disabled?"disabled ":"")+'/>'+
    '<span>'+d+' day'+(d!==1?"s":"")+' before</span></label>').join("");
}
function render(){
  if(!mounted)return;
  const snap=evaluate();
  if(!snap)return;
  const unread=alerts.filter(a=>a.unread).length;
  const serverUnread=Number(snap.unread)||0;
  const badge=$("wl-badge");
  if(badge){badge.hidden=!(unread+serverUnread);badge.textContent=unread+serverUnread>99?"99+":String(unread+serverUnread);}
  const notif=rootElement()?.querySelector('[data-act="notifications"]');
  if(notif)notif.setAttribute("aria-label","Notifications: "+unread+" unread expiry alerts and "+serverUnread+" account notifications");
  const count=$("wl-alert-counter");if(count)count.textContent=unread+" unread";
  const list=$("wl-alert-list");
  if(list)list.innerHTML=alerts.length?alerts.map(allAlertMarkup).join(""):'<div class="wl-alert-empty">No expiry alerts right now. Your active cards will appear here when they reach a reminder date.</div>';
  const recent=$("wl-alert-history");
  if(recent)recent.innerHTML=settings.history.length?settings.history.slice(-12).reverse().map(historyMarkup).join(""):'<p class="wl-alert-note">No reminder activity yet.</p>';
  const srv=$("wl-account-notifications");
  if(srv)srv.textContent="Account notifications"+(serverUnread?" ("+serverUnread+" unread)":"");
  const enabled=$("wl-alert-enabled");
  if(enabled)enabled.checked=settings.enabled;
  const options=$("wl-alert-thresholds");
  if(options)options.innerHTML=thresholdOptions(settings.thresholds,"expiry-day",!settings.enabled);
  const summary=$("wl-alert-summary");
  if(summary)summary.textContent=settings.enabled?"Alerts appear only when the wallet is open. Timing is saved on this device.":"In-app expiry reminders are paused on this device.";
  if(cardId&&$("wl-card-reminder-dialog")&&!$("wl-card-reminder-dialog").hidden)renderCardControls();
}
function rootElement(){return $("giftWalletLive");}
function center(){
  if(!mounted)mount();
  if(!mounted||!data())return;
  window.walletLiveOpenSection?.("alerts");
  render();
}
function cardControls(){
  const s=data();const card=s?.cards.find(c=>c.id===cardId);
  if(!card)return '';
  const opts=settings.cards[cardId]||{enabled:true};
  const custom=Array.isArray(opts.thresholds);
  return '<p class="wl-alert-note">This changes reminders for <strong>'+esc(card.store)+'</strong> on this device only.</p>'+
  '<label class="wl-alert-toggle"><input id="wl-alert-card-enabled" type="checkbox" '+(opts.enabled!==false?"checked":"")+'/> Remind me about this card</label>'+
  '<label class="wl-alert-toggle"><input id="wl-alert-card-custom" type="checkbox" '+(custom?"checked":"")+'/> Customize timing for this card</label>'+
  '<div class="wl-alert-options" id="wl-alert-card-days">'+thresholdOptions(custom?opts.thresholds:settings.thresholds,"expiry-card-day",!custom||opts.enabled===false)+'</div>'+
  '<p class="wl-alert-note">If custom timing is off, this card follows your global schedule.</p>';
}
function renderCardControls(){const e=$("wl-alert-card-form");if(e)e.innerHTML=cardControls();}
function cardSettings(id){
  if(!mounted)mount();
  const snap=ensureAccount();
  if(!snap||!snap.cards.some(c=>c.id===id))return;
  cardId=id;
  renderCardControls();
  const dialog=$("wl-card-reminder-dialog");
  dialog.hidden=false;
  $("wl-card-reminder-close").focus();
}
function closeCard(){const el=$("wl-card-reminder-dialog");if(!el||el.hidden)return false;el.hidden=true;cardId=null;return true;}
function handleAction(e){
  const node=e.target.closest("[data-expiry-action]");
  if(!node)return;
  const action=node.dataset.expiryAction;
  if(action==="back"){window.walletLiveOpenSection?.("wallet");return;}
  if(action==="close-card"){closeCard();return;}
  if(action==="preferences"){window.walletLiveOpenSection?.("settings");$("wl-alert-settings")?.scrollIntoView({block:"start",behavior:"smooth"});return;}
  if(action==="server"){window.walletLiveShowClassic?.("notifications");return;}
  const selected=alerts.find(a=>a.id===node.dataset.alert);
  if(!selected)return;
  if(action==="open"){settings=api.act(settings,selected,"read");persist();render();window.walletLiveOpenCard?.(selected.cardId);return;}
  if(["read","snoozed","dismissed"].includes(action)){settings=api.act(settings,selected,action);persist();render();}
}
function onChange(e){
  const snap=ensureAccount();if(!snap)return;
  const el=e.target;
  if(el.id==="wl-alert-enabled"){settings=api.setEnabled(settings,el.checked);persist();render();return;}
  if(el.dataset.expiryDay){settings=api.setThreshold(settings,+el.dataset.expiryDay,el.checked);persist();render();return;}
  if(!cardId)return;
  if(el.id==="wl-alert-card-enabled"){settings=api.setCardEnabled(settings,cardId,el.checked);persist();render();return;}
  if(el.id==="wl-alert-card-custom"){
    settings=api.setCardSchedule(settings,cardId,el.checked?settings.thresholds:null);
    persist();render();return;
  }
  if(el.dataset.expiryCardDay){
    const old=settings.cards[cardId]?.thresholds||settings.thresholds;
    const day=+el.dataset.expiryCardDay;
    const next=api.STEPS.filter(d=>d===day?el.checked:old.includes(d));
    settings=api.setCardSchedule(settings,cardId,next);
    persist();render();
  }
}
function markup(){
  return '<section id="wl-view-alerts" class="wl-view" hidden>'+
   '<div class="wl-title"><div><small>YOUR REMINDERS</small><h1>Expiry alerts</h1><p>Make every gift card count.</p></div>'+
   '<button type="button" class="wl-outline" data-expiry-action="preferences">Preferences</button></div>'+
   '<div class="wl-alert-summary"><span id="wl-alert-counter">0 unread</span><span>In-app reminders · This device</span></div>'+
   '<div class="wl-list" id="wl-alert-list"></div>'+
   '<div class="wl-panel wl-alert-account"><h2>Other activity</h2><p>Code access approvals and messages from your shared vault.</p>'+
   '<button type="button" class="wl-outline" id="wl-account-notifications" data-expiry-action="server">Account notifications</button></div>'+
   '<div class="wl-panel wl-alert-activity"><h2>Recent reminder activity</h2><div id="wl-alert-history"></div></div>'+
   '<button type="button" class="wl-link" data-expiry-action="back">Back to wallet</button></section>';
}
function settingsMarkup(){
  return '<div class="wl-panel wl-alert-settings" id="wl-alert-settings"><h2>Expiry reminders</h2>'+
   '<p id="wl-alert-summary">Alerts appear only when your wallet is open.</p>'+
   '<label class="wl-alert-toggle"><input id="wl-alert-enabled" type="checkbox" checked /> Enable in-app reminders</label>'+
   '<div class="wl-alert-options" id="wl-alert-thresholds"></div>'+
   '<p class="wl-alert-note">Alerts also appear on the expiry day or if a card remains active after expiring. Email and push are not yet enabled.</p>'+
   '</div>';
}
function cardModalMarkup(){
  return '<div id="wl-card-reminder-dialog" class="wl-overlay" hidden>'+
   '<div class="wl-dialog wl-alert-dialog" role="dialog" aria-modal="true" aria-labelledby="wl-alert-card-title">'+
   '<div class="wl-dialog-top"><h2 id="wl-alert-card-title">Card reminders</h2><button type="button" id="wl-card-reminder-close" data-expiry-action="close-card">Close</button></div>'+
   '<div id="wl-alert-card-form"></div></div></div>';
}
function mount(){
  if(mounted)return;
  const root=rootElement();
  if(!root||!root.querySelector("#wl-view-settings"))return;
  root.querySelector("#wl-view-settings").insertAdjacentHTML("beforebegin",markup());
  root.querySelector("#wl-view-settings .wl-settings").insertAdjacentHTML("beforebegin",settingsMarkup());
  root.insertAdjacentHTML("beforeend",cardModalMarkup());
  root.addEventListener("click",handleAction);
  root.addEventListener("change",onChange);
  $("wl-card-reminder-dialog").addEventListener("click",e=>{if(e.target===$("wl-card-reminder-dialog"))closeCard();});
  document.addEventListener("keydown",e=>{if(e.key==="Escape")closeCard();});
  mounted=true;
  render();
}
function refresh(){if(!mounted)mount();render();}
window.walletExpiryOpenCenter=center;
window.walletExpiryOpenCardSettings=cardSettings;
window.walletExpiryHandleBack=closeCard;
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",mount,{once:true});else mount();
document.addEventListener("visibilitychange",()=>{if(!document.hidden)refresh();});
window.addEventListener("focus",refresh);
// In-app only: a foreground timer refreshes the date and local alert badges.
// No service-worker push is scheduled and nothing runs after the app is closed.
setInterval(()=>{if(!document.hidden&&rootElement()&&!rootElement().hidden)refresh();},60000);
const oldRefresh=window.walletLiveRefresh;
if(typeof oldRefresh==="function")window.walletLiveRefresh=function(){oldRefresh.apply(this,arguments);refresh();};
const oldStart=window.walletLiveStart;
if(typeof oldStart==="function")window.walletLiveStart=function(){oldStart.apply(this,arguments);refresh();};
})();