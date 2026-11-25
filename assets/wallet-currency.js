/* F04: gift card denomination and merchant spending currency are distinct.
 * No automatic FX conversion. Currency exceptions require issuer evidence
 * approved server-side for this *particular card* and currency pair. */
(function(root,factory){
 const api=factory();
 if(typeof module==="object"&&module.exports)module.exports=api;
 if(root)root.GiftVaultCurrency=api;
})(typeof globalThis!=="undefined"?globalThis:undefined,function(){
 "use strict";
 const CURRENCIES=Object.freeze(["INR","CAD","USD"]);
 const SUPPORTED=new Set(CURRENCIES);
 function code(value){return SUPPORTED.has(value)?value:null;}
 function cardCurrency(c){return code(c?.currency)||"INR";} // migration backfills legacy cards as INR
 function format(amount,currency){
   const cur=code(currency)||"INR";
   const locale=cur==="INR"?"en-IN":cur==="CAD"?"en-CA":"en-US";
   const n=Number(amount);
   const value=Number.isFinite(n)?n:0;
   const result=new Intl.NumberFormat(locale,{style:"currency",currency:cur,minimumFractionDigits:2,maximumFractionDigits:2}).format(value);
   // Distinguish Canadian dollars from US dollars even in mixed dashboards.
   return cur==="CAD"?"CA"+result:cur==="USD"?"US"+result:result;
 }
 function totals(cards){
   const totals={INR:0,CAD:0,USD:0};
   for(const c of Array.isArray(cards)?cards:[]){
     const cur=cardCurrency(c);
     const n=Number(c?.amount);
     if(Number.isFinite(n))totals[cur]+=n;
   }
   return totals;
 }
 function summary(cards){
   const ts=totals(cards);
   return CURRENCIES.filter(c=>ts[c]!==0).map(c=>format(ts[c],c)+" "+c).join(" · ")||"No balance";
 }
 function approvedFor(card,target,permissions,now=new Date()){
   const source=code(card?.currency);
   if(!source||!code(target))return null;
   if(source===target)return {sameCurrency:true,currency:source};
   const found=(Array.isArray(permissions)?permissions:[]).find(p=>
     p&&p.couponId===card.id&&p.sourceCurrency===source&&p.targetCurrency===target&&p.active===true
     &&p.verifiedBy&&typeof p.evidenceUrl==="string"&&/^https:\/\//.test(p.evidenceUrl)
     &&(!p.validUntil||/^\d{4}-\d{2}-\d{2}$/.test(p.validUntil)&&p.validUntil>=
       [now.getFullYear(),String(now.getMonth()+1).padStart(2,"0"),String(now.getDate()).padStart(2,"0")].join("-")));
   return found||null;
 }
 function validate(card,target,cardDebit,chargedAmount,permissions,now=new Date()){
   const source=code(card?.currency),dest=code(target);
   if(!source||!dest)return {ok:false,message:"Select a supported card and checkout currency."};
   const amount=Number(cardDebit);
   if(!Number.isFinite(amount)||amount<=0||Math.round(amount*100)/100!==amount)return {ok:false,message:"Enter a positive card debit with at most two decimals."};
   if(amount>Number(card.amount))return {ok:false,message:"Cannot deduct more than the card's original-currency balance."};
   if(source===dest){
     if(chargedAmount!==""&&chargedAmount!==null&&chargedAmount!==undefined &&
         Number(chargedAmount)!==amount)return {ok:false,message:"Same-currency charged amount must equal the card debit."};
     return {ok:true,source,target:dest,cardDebit:amount,chargedAmount:amount,exception:false};
   }
   const permission=approvedFor(card,dest,permissions,now);
   if(!permission)return {ok:false,message:"Cross-currency use is blocked until the brand confirms this card is eligible and an administrator verifies its terms."};
   if(chargedAmount===""||chargedAmount===null||chargedAmount===undefined)return {ok:false,message:"Enter the amount actually charged by the merchant in "+dest+"; no exchange rate is assumed."};
   const charged=Number(chargedAmount);
   if(!Number.isFinite(charged)||charged<=0||Math.round(charged*100)/100!==charged)return {ok:false,message:"Merchant charge must be a positive "+dest+" amount with at most two decimals."};
   return {ok:true,source,target:dest,cardDebit:amount,chargedAmount:charged,exception:true,verification:permission};
 }
 return Object.freeze({CURRENCIES,code,cardCurrency,format,totals,summary,approvedFor,validate});
});
