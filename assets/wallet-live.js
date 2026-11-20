/* Wallet-first authenticated view. Supabase and authorization remain in index.html. */
(function(){
"use strict";
const $=id=>document.getElementById(id);
const money=n=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:2}).format(Number(n)||0);
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const dateText=d=>d?new Date(d+"T00:00:00").toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"}):"No expiry";
const days=d=>d?Math.round((new Date(d+"T00:00:00")-new Date(new Date().toDateString()))/86400000):Infinity;
const active=c=>c.status==="active"&&Number(c.amount)>0&&days(c.expiry)>=0;
const gradients=["linear-gradient(135deg,#154c44,#208f79)","linear-gradient(135deg,#1c335d,#426fbc)","linear-gradient(135deg,#5a2c62,#a24a9b)","linear-gradient(135deg,#364369,#6b7ac4)","linear-gradient(135deg,#495132,#7b9b51)"];
const theme=s=>gradients[Math.abs(Array.from(String(s)).reduce((n,x)=>(n*31+x.charCodeAt(0))|0,7))%gradients.length];
const icon=n=>'<svg class="wl-icon" aria-hidden="true"><use href="#wl-'+n+'"/></svg>';
let root=null,adapter=null,section="wallet",search="",index=0,detailId=null,loading=false;
function shell(){
return [
'<svg aria-hidden="true" class="wl-sprites" xmlns="http://www.w3.org/2000/svg"><defs>',
'<symbol id="wl-wallet" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="15" rx="2"/><path d="M16 12h5M3 8h18"/></symbol>',
'<symbol id="wl-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></symbol>',
'<symbol id="wl-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></symbol>',
'<symbol id="wl-bell" viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></symbol>',
'<symbol id="wl-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></symbol>',
'<symbol id="wl-chart" viewBox="0 0 24 24"><path d="M4 20V11M10 20V4M16 20v-7M22 20V8"/></symbol>',
'<symbol id="wl-users" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 5a3 3 0 0 1 0 6m4 9v-2a6 6 0 0 0-4-5.65"/></symbol>',
'<symbol id="wl-settings" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="m19 12 2-1-2-4-2 1-2-1-.5-2h-5L9 7 7 8 5 7l-2 4 2 1v2l-2 1 2 4 2-1 2 1 .5 2h5l.5-2 2-1 2 1 2-4-2-1v-2Z"/></symbol>',
'<symbol id="wl-left" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></symbol>',
'<symbol id="wl-right" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></symbol>',
'<symbol id="wl-eye" viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></symbol>',
'<symbol id="wl-x" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></symbol>',
'<symbol id="wl-refresh" viewBox="0 0 24 24"><path d="M21 3v6h-6M3 21v-6h6"/><path d="M5 9a8 8 0 0 1 14-3l2 3M3 15l2 3a8 8 0 0 0 14-3"/></symbol>',
'</defs></svg>',
'<div class="wl-page"><header class="wl-head"><div class="wl-brand"><span class="wl-logo">',icon("wallet"),'</span><span><strong>Gift Vault</strong><small>My cards & coupons</small></span></div>',
'<div class="wl-head-actions"><button type="button" data-act="search" aria-label="Search">',icon("search"),'</button><button type="button" data-act="notifications" aria-label="Notifications">',icon("bell"),'<span id="wl-badge" hidden></span></button><button class="wl-user" type="button" data-tab="settings" aria-label="Account">GV</button></div></header>',
'<nav class="wl-nav" aria-label="Wallet navigation">',
...["wallet","expiring","insights","family","settings"].map((n,i)=>'<button type="button" class="'+(!i?"active":"")+'" data-tab="'+n+'">'+icon(n==="wallet"?"wallet":n==="expiring"?"clock":n==="insights"?"chart":n==="family"?"users":"settings")+'<span>'+n[0].toUpperCase()+n.slice(1)+'</span></button>'),
'</nav><div class="wl-search" id="wl-search" hidden>',icon("search"),'<input type="search" id="wl-query" placeholder="Search stores and accounts" aria-label="Search"><button type="button" data-act="clear-search" aria-label="Clear search">',icon("x"),'</button></div>',
'<section id="wl-view-wallet" class="wl-view"><div class="wl-title"><div><small>YOUR WALLET</small><h1>My cards</h1><p>Everything you need, all in one place.</p></div><button type="button" class="wl-add" data-act="add">',icon("plus"),'<span>Add card</span></button></div>',
'<div id="wl-metrics" class="wl-metrics"></div><div class="wl-columns"><div><div class="wl-section-title"><h2>Featured card</h2><span>Tap to open</span></div><div class="wl-stack"><div class="wl-shadow one"></div><div class="wl-shadow two"></div><button type="button" id="wl-featured" data-act="details"></button></div>',
'<div class="wl-arrows"><button data-act="previous" type="button" aria-label="Previous card">',icon("left"),'</button><span id="wl-pos"></span><button data-act="next" type="button" aria-label="Next card">',icon("right"),'</button></div>',
'<div class="wl-quick"><button type="button" data-act="code">',icon("eye"),' View code</button><button type="button" data-act="remind">',icon("bell"),' Remind me</button><button type="button" data-act="details">',icon("wallet"),' Details</button></div>',
'<div class="wl-section-title"><h2>My gift cards</h2><span id="wl-count"></span></div><div class="wl-tiles" id="wl-cards"></div><button type="button" data-tab="history" class="wl-link">Used & expired cards</button></div>',
'<aside class="wl-aside"><div class="wl-section-title"><h2>Expiring soon</h2><button type="button" data-tab="expiring">View all</button></div><div id="wl-upcoming" class="wl-panel"></div></aside></div></section>',
'<section id="wl-view-expiring" class="wl-view" hidden><div class="wl-title"><div><small>STAY ON TOP</small><h1>Expiring soon</h1><p>Use your cards before they expire.</p></div></div><div id="wl-expiring-list" class="wl-list"></div></section>',
'<section id="wl-view-insights" class="wl-view" hidden><div class="wl-title"><div><small>AT A GLANCE</small><h1>Insights</h1><p>Your wallet summary.</p></div></div><div id="wl-insights-metrics" class="wl-metrics"></div><div class="wl-panel"><h2>Balances by store</h2><div id="wl-stores"></div></div></section>',
'<section id="wl-view-history" class="wl-view" hidden><div class="wl-title"><div><small>HISTORY</small><h1>Used & expired</h1></div></div><div id="wl-history-list" class="wl-list"></div><button class="wl-outline" type="button" data-tab="wallet">Back to wallet</button></section>',
'<section id="wl-view-family" class="wl-view" hidden><div class="wl-title"><div><small>SHARING</small><h1>Vault members</h1><p>See who has access to your shared vault.</p></div></div><div id="wl-members" class="wl-list"></div><div class="wl-panel"><h2>Code privacy</h2><p>Private redemption codes require the owner’s approval.</p><button type="button" id="wl-manage" class="wl-outline" data-act="admin">Manage members</button></div></section>',
'<section id="wl-view-settings" class="wl-view" hidden><div class="wl-title"><div><small>ACCOUNT</small><h1>Settings</h1></div></div><div class="wl-panel"><h2>Signed in</h2><p id="wl-account"></p><p id="wl-role"></p></div><div class="wl-settings"><button type="button" data-act="refresh">',icon("refresh"),' Sync now</button><button type="button" data-act="classic">Advanced tools</button><button type="button" id="wl-backup" data-act="backup">Export backup</button><button type="button" data-act="logout">Sign out</button></div></section>',
'</div><div id="wl-overlay" class="wl-overlay" hidden><div class="wl-dialog" role="dialog" aria-modal="true" aria-labelledby="wl-dialog-title"><div class="wl-dialog-top"><h2 id="wl-dialog-title"></h2><button type="button" data-act="close" aria-label="Close">',icon("x"),'<span>Close</span></button></div><div id="wl-dialog-body"></div></div></div>'
].join("");
}
function snap(){return adapter&&adapter.snapshot();}
function choices(s){const q=search.toLowerCase();return s.cards.filter(c=>active(c)&&(!q||[c.store,c.account,c.type,c.notes].some(x=>String(x||"").toLowerCase().includes(q))));}
function moneySum(cs){return cs.reduce((s,c)=>s+Number(c.amount||0),0);}
function metric(a,b,c){return '<div class="wl-metric"><small>'+esc(a)+'</small><strong>'+esc(b)+'</strong><span>'+esc(c)+'</span></div>';}
function row(c){const d=days(c.expiry);const sub=c.expiry?(d<0?"Expired":d===0?"Expires today":d===1?"Tomorrow":d+" days left"):"No expiry";return '<button class="wl-row" data-act="open" data-id="'+esc(c.id)+'" type="button"><span class="wl-row-logo" style="background:'+theme(c.store)+'">'+esc(c.store.slice(0,1).toUpperCase())+'</span><span class="wl-row-copy"><strong>'+esc(c.store)+'</strong><small>'+esc(c.account)+' · '+esc(sub)+'</small></span><b>'+money(c.amount)+'</b></button>';}
function render(){
if(!root||root.hidden)return;const s=snap();if(!s){hide();return;}
const cards=s.cards.filter(active),show=choices(s),exp=cards.filter(c=>Number.isFinite(days(c.expiry))&&days(c.expiry)<=14).sort((a,b)=>days(a.expiry)-days(b.expiry)),up=cards.filter(c=>Number.isFinite(days(c.expiry))&&days(c.expiry)<=30).sort((a,b)=>days(a.expiry)-days(b.expiry));if(index>=show.length)index=0;
$("wl-metrics").innerHTML=metric("Available",money(moneySum(cards)),cards.length+" active cards")+metric("Expiring in 14 days",exp.length+" cards",money(moneySum(exp))+" remaining")+metric("Total saved",s.cards.length+" cards","Shared vault");
$("wl-insights-metrics").innerHTML=metric("Available",money(moneySum(cards)),"Active balances")+metric("Active cards",cards.length,"Ready to use")+metric("Expiring soon",exp.length,"Within 14 days");
const current=show[index],featured=$("wl-featured");
if(current){featured.disabled=false;featured.style.background=theme(current.store);featured.innerHTML='<div><small>'+esc(current.type)+'</small><strong>'+esc(current.store)+'</strong><span>'+esc(current.account)+'</span></div><div class="wl-featured-bottom"><div><small>Balance</small><strong>'+money(current.amount)+'</strong></div><div><small>Expires</small><b>'+esc(dateText(current.expiry))+'</b></div></div>';}
else{featured.disabled=true;featured.style.background="#28364b";featured.innerHTML='<strong>No matching cards</strong>';}
$("wl-pos").textContent=show.length?(index+1)+" of "+show.length:"No cards";$("wl-count").textContent=show.length+" cards";
$("wl-cards").innerHTML=show.map(c=>'<button type="button" class="wl-tile" data-act="open" data-id="'+esc(c.id)+'" style="background:'+theme(c.store)+'"><strong>'+esc(c.store)+'</strong><span>'+money(c.amount)+'</span><small>'+esc(c.type)+' · '+esc(dateText(c.expiry))+'</small></button>').join("")||'<p class="wl-empty">No cards match your search.</p>';
$("wl-upcoming").innerHTML=up.slice(0,5).map(row).join("")||'<p class="wl-empty">Nothing expiring within 30 days.</p>';
$("wl-expiring-list").innerHTML=exp.map(row).join("")||'<p class="wl-empty">No cards expiring within 14 days.</p>';
$("wl-history-list").innerHTML=s.cards.filter(c=>!active(c)).map(row).join("")||'<p class="wl-empty">No used or expired cards.</p>';
const grouped=new Map();cards.forEach(c=>grouped.set(c.store,(grouped.get(c.store)||0)+Number(c.amount||0)));
$("wl-stores").innerHTML=[...grouped.entries()].sort((a,b)=>b[1]-a[1]).map(([store,value])=>'<div class="wl-store"><span>'+esc(store)+'</span><strong>'+money(value)+'</strong></div>').join("")||'<p class="wl-empty">No active balances yet.</p>';
$("wl-members").innerHTML=s.members.map(m=>'<div class="wl-member"><span>'+esc((m.name||"?").slice(0,1).toUpperCase())+'</span><div><strong>'+esc(m.name)+'</strong><small>'+esc(m.role)+(m.isPendingInvite?" · invited":"")+'</small></div></div>').join("");
$("wl-manage").hidden=s.user.role!=="super_admin";$("wl-backup").hidden=s.user.role!=="super_admin";root.querySelectorAll('[data-act="add"]').forEach(b=>b.hidden=!s.canAdd);
$("wl-account").textContent=s.user.email;$("wl-role").textContent=s.user.role;
const badge=$("wl-badge");badge.hidden=!s.unread;badge.textContent=s.unread>99?"99+":s.unread;
if(detailId&&!s.cards.some(c=>c.id===detailId))closeDetails();
}
function currentCard(){const s=snap();return s&&choices(s)[index];}
function view(name){section=name;root.querySelectorAll(".wl-view").forEach(el=>el.hidden=el.id!=="wl-view-"+name);root.querySelectorAll(".wl-nav button").forEach(b=>{const on=b.dataset.tab===name||(name==="history"&&b.dataset.tab==="wallet");b.classList.toggle("active",on);if(on)b.setAttribute("aria-current","page");else b.removeAttribute("aria-current");});}
function openDetails(id){const s=snap(),c=s&&s.cards.find(c=>c.id===id);if(!c)return;detailId=id;
$("wl-dialog-title").textContent=c.store;
const access=adapter.canReveal(id),edit=adapter.canEdit(id),spend=s.canAdd&&active(c);
$("wl-dialog-body").innerHTML='<div class="wl-detail-art" style="background:'+theme(c.store)+'"><small>'+esc(c.type)+'</small><h3>'+esc(c.store)+'</h3><strong>'+money(c.amount)+'</strong></div><div class="wl-detail-grid"><div><small>Account</small><strong>'+esc(c.account)+'</strong></div><div><small>Expiry</small><strong>'+esc(dateText(c.expiry))+'</strong></div></div>'+(c.notes?'<p>'+esc(c.notes)+'</p>':'')+'<div class="wl-code"><div><small>Redemption code</small><strong id="wl-code-value">•••• •••• ••••</strong></div><div id="wl-code-action">'+(!c.hasSecretCode?'No code saved':access?'<button type="button" data-act="reveal">Reveal code</button>':'<button type="button" data-act="request">Request access</button>')+'</div></div><div class="wl-detail-actions"><button type="button" data-act="remind-detail">Remind</button>'+(spend?'<button type="button" data-act="spend">Spend / deduct</button>':'')+(edit?'<button type="button" data-act="edit">Edit</button>':'')+'</div>';
$("wl-overlay").hidden=false;$("wl-overlay").querySelector(".wl-dialog-top button").focus();
}
function closeDetails(){if(detailId)adapter.hideCode(detailId);detailId=null;$("wl-overlay").hidden=true;$("wl-dialog-body").replaceChildren();}
function hide(){if(detailId)closeDetails();if(root)root.hidden=true;const app=$("appScreen");if(app)app.classList.remove("wallet-mode");}
function start(){if(!root||!snap())return;root.hidden=false;$("appScreen").classList.add("wallet-mode");view("wallet");render();}
async function action(name,id){
const c=id||(currentCard()&&currentCard().id);
if(name==="next"||name==="previous"){const s=snap(),len=s?choices(s).length:0;if(len){index=(index+(name==="next"?1:len-1))%len;render();}return;}
if(name==="search"){$("wl-search").hidden=false;$("wl-query").focus();return;}
if(name==="clear-search"){$("wl-search").hidden=true;$("wl-query").value="";search="";index=0;render();return;}
if(name==="open"||name==="details"||name==="code"){if(c)openDetails(c);return;}
if(name==="close"){closeDetails();return;}
if(name==="add"){adapter.add();return;}
if(name==="notifications"||name==="admin"||name==="classic"){hide();adapter.legacy(name==="notifications"?"notifications":name==="admin"?"admin":"all");return;}
if(name==="refresh"){await adapter.refresh();render();return;}
if(name==="logout"){hide();await adapter.logout();return;}
if(name==="backup"){adapter.backup();return;}
if(name==="request"){if(detailId){const id=detailId;closeDetails();adapter.request(id);}return;}
if(name==="conceal"){if(detailId){adapter.hideCode(detailId);$("wl-code-value").textContent="•••• •••• ••••";$("wl-code-action").innerHTML='<button type="button" data-act="reveal">Reveal code</button>';}return;}
if(name==="reveal"){
if(!detailId||loading)return;const id=detailId;loading=true;const button=root.querySelector('[data-act="reveal"]');if(button)button.disabled=true;
try{const secret=await adapter.reveal(id);if(detailId===id){if(secret){$("wl-code-value").textContent=secret;$("wl-code-action").innerHTML='<button type="button" data-act="conceal">Hide code</button>';}else if(button)button.disabled=false;}}finally{loading=false;}return;
}
if(!c)return;
if(name==="remind"||name==="remind-detail"){if(detailId)closeDetails();adapter.remind(c);}
if(name==="spend"){closeDetails();adapter.spend(c);}
if(name==="edit"){closeDetails();await adapter.edit(c);}
}
function setup(){
const app=$("appScreen");adapter=window.giftVaultLiveBridge;if(!app||!adapter||root)return;
root=document.createElement("section");root.id="giftWalletLive";root.className="wl-root";root.hidden=true;root.innerHTML=shell();app.insertBefore(root,app.firstChild);
root.addEventListener("click",e=>{const tab=e.target.closest("button[data-tab]");if(tab){view(tab.dataset.tab);return;}const b=e.target.closest("button[data-act]");if(b)Promise.resolve(action(b.dataset.act,b.dataset.id)).catch(err=>console.error("Wallet action failed",err));});
$("wl-query").addEventListener("input",e=>{search=e.target.value;index=0;render();});
$("wl-overlay").addEventListener("click",e=>{if(e.target===$("wl-overlay"))closeDetails();});
let initialX=null;const stack=root.querySelector(".wl-stack");
stack.addEventListener("touchstart",e=>{initialX=e.changedTouches[0].clientX;},{passive:true});
stack.addEventListener("touchend",e=>{if(initialX!=null){const dx=e.changedTouches[0].clientX-initialX;if(Math.abs(dx)>50)action(dx<0?"next":"previous");initialX=null;}},{passive:true});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("wl-overlay").hidden)closeDetails();});
if(snap())start();
}
window.walletLiveStart=()=>{if(!root)setup();start();};
window.walletLiveRefresh=()=>{if(!root)setup();render();};
window.walletLiveHandleBack=()=>{if(root&&!root.hidden){if(!$("wl-overlay").hidden){closeDetails();return true;}if(section!=="wallet"){view("wallet");return true;}}return false;};
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",setup,{once:true});else setup();
})();