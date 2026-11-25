/* F02: device-local expiry reminder rules. No networking, secrets or push. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GiftVaultExpiry = api;
})(typeof globalThis !== 'undefined' ? globalThis : undefined, function () {
  'use strict';
  const STEPS = Object.freeze([30, 15, 7, 3, 1]);
  const isRecord = x => !!x && typeof x === 'object' && !Array.isArray(x);
  const validThresholds = xs => Array.isArray(xs) ? STEPS.filter(x => xs.includes(x)) : STEPS.slice();
  const ymd = value => {
    if (typeof value !== 'string') return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return null;
    const y=+match[1],m=+match[2],d=+match[3];
    const date = new Date(y,m-1,d);
    return date.getFullYear() === y && date.getMonth() === m-1 && date.getDate() === d ? {y,m,d} : null;
  };
  const dateKey = date => [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
  const addDays = (date,count) => {const d=new Date(date.getFullYear(),date.getMonth(),date.getDate());d.setDate(d.getDate()+count);return dateKey(d);};
  function daysUntil(iso,now=new Date()) {
    const day=ymd(iso);
    if (!day || !(now instanceof Date) || Number.isNaN(+now)) return null;
    return Math.round((Date.UTC(day.y,day.m-1,day.d)-Date.UTC(now.getFullYear(),now.getMonth(),now.getDate()))/86400000);
  }
  const defaultState = () => ({version:1,enabled:true,thresholds:STEPS.slice(),cards:{},actions:{},history:[]});
  function normalize(raw) {
    const src=isRecord(raw)?raw:{};
    const next=defaultState();
    next.enabled=src.enabled!==false;
    next.thresholds=validThresholds(src.thresholds);
    if(isRecord(src.cards)) Object.entries(src.cards).slice(0,1000).forEach(([id,v])=>{
      if(!isRecord(v)||!/^[-\w]{1,128}$/.test(id))return;
      next.cards[id]={enabled:v.enabled!==false};
      if(Array.isArray(v.thresholds))next.cards[id].thresholds=validThresholds(v.thresholds);
    });
    if(isRecord(src.actions))Object.entries(src.actions).slice(-1500).forEach(([id,v])=>{
      if(typeof id!=='string'||id.length>240||!isRecord(v))return;
      if(!['read','dismissed','snoozed'].includes(v.status))return;
      next.actions[id]={status:v.status,until:ymd(v.until)?v.until:null,at:typeof v.at==='string'?v.at.slice(0,30):''};
    });
    if(Array.isArray(src.history))next.history=src.history.slice(-100).filter(v=>
      isRecord(v)&&typeof v.cardId==='string'&&v.cardId.length<=128&&ymd(v.expiry)&&['read','dismissed','snoozed'].includes(v.action)&&typeof v.stage==='string'
    ).map(v=>({cardId:v.cardId,expiry:v.expiry,stage:v.stage,action:v.action,at:String(v.at||'').slice(0,30)}));
    return next;
  }
  function scope(userId) {
    if(typeof userId!=='string'||!/^[-\w]{5,128}$/.test(userId))return null;
    return 'gift-vault:expiry:v1:'+userId;
  }
  function load(storage,userId) {
    const key=scope(userId);
    if(!key||!storage||typeof storage.getItem!=='function')return defaultState();
    try{return normalize(JSON.parse(storage.getItem(key)||'{}'));}catch{return defaultState();}
  }
  function save(storage,userId,state) {
    const key=scope(userId);
    if(!key||!storage||typeof storage.setItem!=='function')return false;
    try{storage.setItem(key,JSON.stringify(normalize(state)));return true;}catch{return false;}
  }
  function stageFor(days,thresholds) {
    if(days<0)return 'expired';
    if(days===0)return 'today';
    for(const threshold of [...thresholds].sort((a,b)=>a-b))if(days<=threshold)return String(threshold);
    return null;
  }
  function evaluate(cards,raw,now=new Date()) {
    const state=normalize(raw),result=[];
    if(!state.enabled||!Array.isArray(cards))return result;
    for(const c of cards){
      if(!c||typeof c.id!=='string'||!/^[-\w]{1,128}$/.test(c.id))continue;
      if(c.status!=='active'||!(Number(c.amount)>0))continue;
      const remaining=daysUntil(c.expiry,now);
      if(remaining===null)continue;
      const override=state.cards[c.id];
      if(override&&override.enabled===false)continue;
      const thresholds=override&&Array.isArray(override.thresholds)?override.thresholds:state.thresholds;
      const stage=stageFor(remaining,thresholds);
      if(!stage)continue;
      const id=['expiry',c.id,c.expiry,stage].join(':');
      const reaction=state.actions[id];
      const suppressed=reaction&&(reaction.status==='dismissed'||(reaction.status==='snoozed'&&reaction.until&&daysUntil(reaction.until,now)>0));
      if(suppressed)continue;
      result.push({id,cardId:c.id,expiry:c.expiry,store:String(c.store||'Card'),account:String(c.account||''),amount:Number(c.amount),currency:c.currency||"INR",days:remaining,stage,unread:!reaction||reaction.status!=='read',level:remaining<=3?'urgent':remaining<=7?'warning':'upcoming'});
    }
    result.sort((a,b)=>a.days-b.days||a.store.localeCompare(b.store));
    return result;
  }
  function act(raw,alert,action,now=new Date()) {
    const state=normalize(raw);
    if(!alert||typeof alert.id!=='string'||!['read','dismissed','snoozed'].includes(action))return state;
    const until=action==='snoozed'?addDays(now,1):null;
    state.actions[alert.id]={status:action,until,at:now.toISOString()};
    state.history.push({cardId:alert.cardId,expiry:alert.expiry,stage:alert.stage,action,at:now.toISOString()});
    state.history=state.history.slice(-100);
    return normalize(state);
  }
  function setEnabled(raw,on){const s=normalize(raw);s.enabled=Boolean(on);return s;}
  function setThreshold(raw,day,on){const s=normalize(raw);if(!STEPS.includes(day))return s;s.thresholds=STEPS.filter(v=>v===day?Boolean(on):s.thresholds.includes(v));return s;}
  function setCardEnabled(raw,id,on){const s=normalize(raw);if(!/^[-\w]{1,128}$/.test(String(id)))return s;const prev=s.cards[id]||{};s.cards[id]={...prev,enabled:Boolean(on)};return s;}
  function setCardSchedule(raw,id,thresholds) {
    const s=normalize(raw);
    if(!/^[-\w]{1,128}$/.test(String(id)))return s;
    const current=s.cards[id]||{enabled:true};
    if(thresholds===null)delete current.thresholds;
    else current.thresholds=validThresholds(thresholds);
    s.cards[id]=current;
    return s;
  }
  return Object.freeze({STEPS,defaultState,normalize,daysUntil,dateKey,load,save,scope,evaluate,act,setEnabled,setThreshold,setCardEnabled,setCardSchedule});
});