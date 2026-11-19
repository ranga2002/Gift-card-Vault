/* Progressive dashboard, search, and expiry insight enhancements.
   Uses existing state and UI; does not read or cache redemption secrets. */
(function(){
  'use strict';
  const get=id=>document.getElementById(id);
  const fmt=n=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(Number(n)||0);
  const active=c=>typeof isCouponActive==='function'&&isCouponActive(c);
  const days=c=>typeof daysUntil==='function'?daysUntil(c.expiry):9999;
  window.applyVaultFilters=cards=>{
    const query=(get('vaultFilterSearch')?.value||'').trim().toLocaleLowerCase();
    const status=get('vaultFilterStatus')?.value||'any';
    return cards.filter(c=>{
      const matches=!query||[c.store,c.account,c.notes].some(v=>String(v||'').toLocaleLowerCase().includes(query));
      return matches&&(status==='any'||(status==='active'&&active(c))||(status==='expiring'&&active(c)&&days(c)<=7)||(status==='history'&&!active(c)));
    });
  };
  window.sortVaultCards=cards=>{
    const sort=get('vaultFilterSort')?.value||'expiry';
    const result=[...cards];
    if(sort==='store')result.sort((a,b)=>String(a.store).localeCompare(String(b.store)));
    else if(sort==='balance-high')result.sort((a,b)=>(Number(b.amount)||0)-(Number(a.amount)||0));
    else if(sort==='balance-low')result.sort((a,b)=>(Number(a.amount)||0)-(Number(b.amount)||0));
    else result.sort((a,b)=>days(a)-days(b));
    return result;
  };
  function addInsight(label,value,sub,urgent){
    const el=document.createElement('article');el.className='vault-insight'+(urgent?' urgent':'');
    const small=document.createElement('span');small.className='label';small.textContent=label;
    const strong=document.createElement('strong');strong.textContent=value;
    const p=document.createElement('p');p.textContent=sub;
    el.append(small,strong,p);return el;
  }
  function refresh(){
    const target=get('vaultInsights');
    if(!target||typeof state==='undefined'||!Array.isArray(state.coupons))return;
    const cards=state.coupons.filter(active);
    const urgent=cards.filter(c=>days(c)<=7);
    const next=[...cards].sort((a,b)=>days(a)-days(b))[0];
    target.replaceChildren(
      addInsight('Available value',fmt(cards.reduce((s,c)=>s+(Number(c.amount)||0),0)),cards.length+' active gift cards'),
      addInsight('Expiring in 7 days',fmt(urgent.reduce((s,c)=>s+(Number(c.amount)||0),0)),urgent.length+' cards need attention',urgent.length>0),
      addInsight('Recommended next',next?String(next.store):'All clear',next?fmt(next.amount)+' · '+Math.max(0,days(next))+' days left':'Nothing about to expire')
    );
  }
  function networkBanner(){
    let el=get('vaultOfflineNotice');
    if(navigator.onLine===false){
      if(!el){el=document.createElement('div');el.id='vaultOfflineNotice';el.className='vault-offline';document.body.append(el);}
      el.textContent='Offline — your vault needs a connection to load and save cards';
    }else if(el)el.remove();
  }
  function bind(){
    ['vaultFilterSearch','vaultFilterStatus','vaultFilterSort'].forEach(id=>{
      get(id)?.addEventListener(id==='vaultFilterSearch'?'input':'change',()=>typeof renderVaultContent==='function'&&renderVaultContent());
    });
    get('vaultFilterReset')?.addEventListener('click',()=>{
      for(const id of ['vaultFilterSearch','vaultFilterStatus','vaultFilterSort'])if(get(id))get(id).value=id==='vaultFilterSort'?'expiry':id==='vaultFilterStatus'?'any':'';
      if(typeof renderVaultContent==='function')renderVaultContent();
    });
    const stats=get('statsGrid');
    if(stats)new MutationObserver(refresh).observe(stats,{childList:true});
    refresh();networkBanner();
    window.addEventListener('online',networkBanner);
    window.addEventListener('offline',networkBanner);
    if('serviceWorker'in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
})();
