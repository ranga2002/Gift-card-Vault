/* F03: pure in-memory filtering of permitted card metadata only.
 * Never reads secret redemption values. Browser UI owns these filters;
 * Supabase authentication and RLS remain responsible for data access. */
(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.GiftVaultFilters=api;
})(typeof globalThis!=="undefined"?globalThis:undefined,function(){
"use strict";
const sorts=["expiry-asc","expiry-desc","balance-desc","balance-asc","store-asc","store-desc","newest","account-asc"];
const statuses=["active","all","used","expired"];
const windows=["any","7","14","30","none","expired"];
function defaults(){return {query:"",store:"all",account:"all",type:"all",status:"active",expiry:"any",minBalance:"",maxBalance:"",sort:"expiry-asc"};}
function normalize(raw){
  const s=raw&&typeof raw==="object"?raw:{},out=defaults();
  out.query=String(s.query||"").trim().slice(0,180);
  for(const name of ["store","account","type"]){const v=String(s[name]??"all");out[name]=v==="all"?"all":v.slice(0,150);}
  out.status=statuses.includes(s.status)?s.status:"active";
  out.expiry=windows.includes(s.expiry)?s.expiry:"any";
  out.sort=sorts.includes(s.sort)?s.sort:"expiry-asc";
  for(const name of ["minBalance","maxBalance"]){
    const v=String(s[name]??"").trim();
    if(v===""){out[name]="";continue;}
    const n=Number(v);out[name]=Number.isFinite(n)&&n>=0&&n<=1e11?String(n):"";
  }
  return out;
}
function days(iso,now=new Date()){
  if(typeof iso!=="string"||! /^\d{4}-\d{2}-\d{2}$/.test(iso))return null;
  const [y,m,d]=iso.split("-").map(Number);
  const dt=new Date(Date.UTC(y,m-1,d));
  if(dt.getUTCFullYear()!==y||dt.getUTCMonth()!==m-1||dt.getUTCDate()!==d)return null;
  return Math.round((Date.UTC(y,m-1,d)-Date.UTC(now.getFullYear(),now.getMonth(),now.getDate()))/86400000);
}
function statusOf(c,now=new Date()){
  if(!c||c.status==="used"||Number(c.amount)<=0)return "used";
  const remaining=days(c.expiry,now);
  return remaining!==null&&remaining<0?"expired":"active";
}
const normText=v=>String(v??"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase().trim();
const compareStr=(a,b)=>String(a||"").localeCompare(String(b||""),undefined,{sensitivity:"base",numeric:true});
function sortCards(cards,sort="expiry-asc",now=new Date()){
  const items=[...(Array.isArray(cards)?cards:[])];
  const mode=sorts.includes(sort)?sort:"expiry-asc";
  items.sort((a,b)=>{
    const amtA=Number(a.amount)||0,amtB=Number(b.amount)||0;
    const dA=days(a.expiry,now),dB=days(b.expiry,now);
    let order=0;
    // An undated card always sorts AFTER cards with dates, even descending.
    // Do not coerce Infinity into a tie: that moved no-expiry cards to the top.
    if(mode==="expiry-asc"||mode==="expiry-desc"){
      if(dA===null&&dB===null)order=0;
      else if(dA===null)order=1;
      else if(dB===null)order=-1;
      else order=mode==="expiry-asc"?dA-dB:dB-dA;
    }
    else if(mode==="balance-desc")order=amtB-amtA;
    else if(mode==="balance-asc")order=amtA-amtB;
    else if(mode==="store-asc")order=compareStr(a.store,b.store);
    else if(mode==="store-desc")order=compareStr(b.store,a.store);
    else if(mode==="account-asc")order=compareStr(a.account,b.account);
    else if(mode==="newest"){const da=Date.parse(a.createdAt||"")||0,db=Date.parse(b.createdAt||"")||0;order=db-da;}
    if(!Number.isFinite(order))order=0;
    return order||compareStr(a.store,b.store)||compareStr(a.account,b.account)||compareStr(a.id,b.id);
  });
  return items;
}
function filter(cards,raw={},now=new Date()){
  const f=normalize(raw),q=normText(f.query),min=f.minBalance===""?null:Number(f.minBalance),max=f.maxBalance===""?null:Number(f.maxBalance);
  const out=(Array.isArray(cards)?cards:[]).filter(c=>{
    if(!c||typeof c!=="object")return false;
    const status=statusOf(c,now),remaining=days(c.expiry,now);
    if(f.status!=="all"&&status!==f.status)return false;
    if(f.store!=="all"&&normText(c.store)!==normText(f.store))return false;
    if(f.account!=="all"&&normText(c.account)!==normText(f.account))return false;
    if(f.type!=="all"&&normText(c.type)!==normText(f.type))return false;
    // Only public metadata fields participate in search; never secret values.
    if(q&&!([c.store,c.account,c.type,c.notes].some(v=>normText(v).includes(q))))return false;
    if(f.expiry==="none"&&remaining!==null)return false;
    if(f.expiry==="expired"&&(remaining===null||remaining>=0))return false;
    if(["7","14","30"].includes(f.expiry)&&(remaining===null||remaining<0||remaining>Number(f.expiry)))return false;
    const bal=Number(c.amount);if(!Number.isFinite(bal))return false;
    if(min!==null&&bal<min)return false;
    if(max!==null&&bal>max)return false;
    return true;
  });
  return sortCards(out,f.sort,now);
}
function options(cards){
  function unique(field){return [...new Set((Array.isArray(cards)?cards:[]).map(c=>String(c&&c[field]||"").trim()).filter(Boolean))].sort(compareStr);}
  return {stores:unique("store"),accounts:unique("account"),types:unique("type")};
}
function activeCount(raw){const f=normalize(raw),d=defaults();return ["query","store","account","type","status","expiry","minBalance","maxBalance","sort"].filter(k=>f[k]!==d[k]).length;}
return Object.freeze({sorts,statuses,windows,defaults,normalize,days,statusOf,sortCards,filter,options,activeCount});
});
