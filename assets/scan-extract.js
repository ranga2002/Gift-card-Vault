/* F05 — privacy-first extraction of tentative gift card metadata from OCR text.
 * Pure, synchronous, no network/storage. OCR errors must never trigger a save.
 * Only a confirmed user action can copy suggestions into an editable draft. */
(function (root, factory) {
  const api=factory();
  if (typeof module==="object"&&module.exports) module.exports=api;
  if (root) root.GiftVaultScanExtract=api;
})(typeof globalThis!=="undefined"?globalThis:undefined, function(){
"use strict";
const MAX_TEXT=12000;
const currencies=Object.freeze(["INR","CAD","USD"]);
const monthNames={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,
  jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
function clean(s){return String(s==null?"":s).replace(/\u00a0/g," ").replace(/[ \t]+/g," ").trim();}
function normalizeDate(year,month,day){
  const y=Number(year),m=Number(month),d=Number(day);
  if(!Number.isInteger(y)||y<2000||y>2100||m<1||m>12||d<1||d>31)return null;
  const date=new Date(Date.UTC(y,m-1,d));
  return date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d
    ?[y,String(m).padStart(2,"0"),String(d).padStart(2,"0")].join("-"):null;
}
function parseDate(input){
  const s=clean(input);
  let m=s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if(m)return normalizeDate(m[1],m[2],m[3]);
  m=s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if(m){
    const a=Number(m[1]),b=Number(m[2]);
    // Both interpretations plausible: never silently choose DD/MM vs MM/DD.
    if(a<=12&&b<=12)return null;
    if(a>12)return normalizeDate(m[3],b,a);
    return normalizeDate(m[3],a,b);
  }
  m=s.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/i);
  if(m)return normalizeDate(m[3],monthNames[m[2].slice(0,3).toLowerCase()],m[1]);
  m=s.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/i);
  if(m)return normalizeDate(m[3],monthNames[m[1].slice(0,3).toLowerCase()],m[2]);
  return null;
}
function currencyFromLine(line){
  const s=String(line||"");
  const tokens=new Set();
  if(/\bINR\b|₹/i.test(s))tokens.add("INR");
  if(/\bCAD\b|CA\$|C\$/i.test(s))tokens.add("CAD");
  if(/\bUSD\b|US\$/i.test(s))tokens.add("USD");
  // A bare $ has multiple meanings: do not infer CAD or USD.
  return tokens.size===1?[...tokens][0]:null;
}
function parseMoney(fragment){
  const matches=String(fragment||"").match(/(?:\d{1,3}(?:,\d{3})+|\d{1,11})(?:\.\d{1,2})?/g)||[];
  for(const raw of matches){
    const value=Number(raw.replace(/,/g,""));
    if(Number.isFinite(value)&&value>=0&&value<=9999999999.99)return value;
  }
  return null;
}
function choose(candidates){
  return candidates.sort((a,b)=>b.confidence-a.confidence||a.lineIndex-b.lineIndex)[0]||null;
}
function suggested(value,confidence,reason){
  return {value,confidence,reason,confirmed:false};
}
function maskCode(code){
  const normalized=String(code||"").replace(/[\s-]+/g,"");
  return normalized.length<=4?"••••":"•••• "+normalized.slice(-4);
}
function extract(input){
  const raw=String(input||"").slice(0,MAX_TEXT);
  const lines=raw.split(/\r?\n/).map(clean).filter(Boolean).slice(0,140);
  const warnings=[],res={
    merchant:null,amount:null,currency:null,expiry:null,code:null,
    pinDetected:false,warnings,sourceLength:raw.length
  };
  if(!raw.trim())return res;
  const merchant=[],amounts=[],currenciesFound=[],expiries=[],codes=[];
  const moneyLabels=/(?:gift\s*card\s*(?:balance|value|amount)?|e-?gift|voucher\s*(?:value|balance)?|stored\s*value|remaining\s*balance|available\s*balance|card\s*balance|balance|value|amount)/i;
  const expLabels=/(?:expires?|expir(?:y|ation)?(?:\s*date)?|valid\s*(?:until|till|through)|use\s*by)/i;
  const cardCodeLabels=/(?:gift\s*card\s*(?:number|no\.?|#|code|id)|e-?gift\s*(?:code|number)|voucher\s*(?:code|number)|redemption\s*(?:code|number)|claim\s*code)/i;
  for(let i=0;i<lines.length;i++){
    const line=lines[i],lower=line.toLowerCase();
    if(/(?:pin|security code|cvv|cvc)\s*(?:[:#=-]|\b)/i.test(line))res.pinDetected=true;
    const cur=currencyFromLine(line);
    if(cur)currenciesFound.push({value:cur,confidence:/\b(?:currency|denomination)\b/i.test(line)?0.96:0.79,lineIndex:i});
    if(/^(?:store|merchant|brand)\s*[:=-]\s*\S+/i.test(line)){
      const m=clean(line.replace(/^(?:store|merchant|brand)\s*[:=-]\s*/i,""));
      if(m.length>=2&&m.length<=70)merchant.push({value:m,confidence:0.94,lineIndex:i});
    } else if(i<=2&&line.length>=3&&line.length<=42&&/[A-Za-z]{3}/.test(line)&&
      !/^(?:receipt|invoice|tax invoice|gift card|thank you|order|date|total|balance|amount|value|pin|expiry|valid until|card number)\b/i.test(line)&&
      !/https?:\/\/|www\.|@|(\d{4}[-/.]\d{2}[-/.]\d{2})/i.test(line)){
      merchant.push({value:line,confidence:0.48,lineIndex:i});
    }
    if(expLabels.test(line)){
      const match=line.match(/(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}|[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})/i);
      if(match){
        const v=parseDate(match[1]);
        if(v)expiries.push({value:v,confidence:0.93,lineIndex:i});
        else warnings.push("Expiry date was ambiguous or invalid; enter it manually.");
      }
    }
    if(moneyLabels.test(line)){
      // Prefer an explicit currency-prefixed amount or a value after a label.
      let remainder=line.replace(/^.*?(?:gift\s*card\s*(?:balance|value|amount)?|e-?gift|voucher\s*(?:value|balance)?|stored\s*value|remaining\s*balance|available\s*balance|card\s*balance|balance|value|amount)\s*(?:[:=\-]|is)?\s*/i,"");
      let v=parseMoney(remainder);
      if(v===null&&i+1<lines.length)v=parseMoney(lines[i+1]);
      if(v!==null){
        const strong=/(?:gift\s*card|voucher|stored\s*value|remaining|available|card\s*balance)/i.test(line);
        amounts.push({value:v,confidence:strong?0.89:0.57,lineIndex:i});
        if(cur)currenciesFound.push({value:cur,confidence:0.93,lineIndex:i});
      }
    }
    if(cardCodeLabels.test(line)&&!/\b(?:visa|mastercard|amex|credit|debit)\b/i.test(line)){
      let remainder=clean(line.replace(/^.*?(?:gift\s*card\s*(?:number|no\.?|#|code|id)|e-?gift\s*(?:code|number)|voucher\s*(?:code|number)|redemption\s*(?:code|number)|claim\s*code)\s*(?:[:#=-])?\s*/i,""));
      if(!remainder&&i+1<lines.length)remainder=lines[i+1];
      const candidate=clean(remainder).replace(/^(?:#|no\.)\s*/i,"");
      if(/^[A-Za-z0-9][A-Za-z0-9 -]{5,47}$/.test(candidate)&&/[0-9]/.test(candidate)&&
        !/\bpin\b/i.test(candidate)){
        codes.push({value:candidate,confidence:0.7,lineIndex:i});
      }
    }
  }
  const cMerchant=choose(merchant),cAmount=choose(amounts),cDate=choose(expiries),cCode=choose(codes);
  const distinctCurrencies=[...new Set(currenciesFound.map(c=>c.value))];
  if(distinctCurrencies.length>1)warnings.push("More than one currency appears in the image. Confirm the gift card denomination.");
  if(cMerchant)res.merchant=suggested(cMerchant.value,cMerchant.confidence,cMerchant.confidence<.7?"Merchant inferred from heading; verify the brand.":"Explicit merchant label.");
  if(cAmount)res.amount=suggested(cAmount.value,cAmount.confidence,cAmount.confidence<.8?"Amount may be a receipt total, not remaining gift card balance.":"Likely gift card value or balance.");
  if(distinctCurrencies.length===1){
    const best=choose(currenciesFound.filter(x=>x.value===distinctCurrencies[0]));
    res.currency=suggested(best.value,best.confidence,"Currency found in visible text; confirm it matches the card denomination.");
  }else if(/\$\s*\d/.test(raw))warnings.push("A $ symbol alone does not establish USD versus CAD. Choose the card currency manually.");
  if(cDate)res.expiry=suggested(cDate.value,cDate.confidence,"Expiry label found; check against issuer terms.");
  if(cCode)res.code=suggested(cCode.value,cCode.confidence,"Sensitive card identifier: reveal or apply only with explicit confirmation.");
  if(res.pinDetected)warnings.push("A PIN/security code may be present. PINs are not copied automatically.");
  if(raw.length===MAX_TEXT)warnings.push("Long OCR text was truncated; verify all details.");
  return res;
}
return Object.freeze({MAX_TEXT,currencies,parseDate,currencyFromLine,parseMoney,extract,maskCode});
});
