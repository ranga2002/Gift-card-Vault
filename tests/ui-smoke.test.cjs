'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=p=>fs.readFileSync(new URL('../'+p,'file://'+__filename),'utf8');
test('scripts parse',()=>{new vm.Script(read('assets/vault-enhancements.js'));new vm.Script(read('assets/sw.js'))});
test('website includes redesign and filters',()=>{const html=read('assets/index.html');assert.match(html,/vault-refresh\.css/);assert.match(html,/vault-enhancements\.js/);assert.match(html,/vaultFilterSearch/);assert.match(html,/vaultInsights/)});
test('calendar does not expose revealed card code',()=>{assert.doesNotMatch(read('assets/index.html'),/const revealed = c\.id \? revealedSecrets\[c\.id\]/)});
test('legacy unauthenticated API removed',()=>{const server=read('cloud_server.js');assert.doesNotMatch(server,/Admin@1234|X-Vault-User-Id|\/api\/vault/)});
test('PWA caches only static resources',()=>{const cache=read('assets/sw.js');assert.doesNotMatch(cache,/supabase-config|coupon_secrets|\/api\//);assert.equal(JSON.parse(read('assets/manifest.webmanifest')).display,'standalone')});

test('outline icons parse and are referenced by the app',()=>{new vm.Script(read('assets/vault-icons.js'));assert.ok(read('assets/index.html').includes('vault-icons.js'));assert.ok(read('assets/vault-refresh.css').includes('.ui-icon'))});
test('standalone preview uses SVG outline icons, not emoji',()=>{const p=read('preview/index.html');assert.match(p,/class="ui-icon"/);assert.doesNotMatch(p,/[🎁🎟️🔔🔐🛍️📅🌐]/u);assert.match(p,/PREVIEW ONLY/)});

// These are static style guards; browser-based mobile QA is still required.
test('responsive layouts cover narrow phones and protect zoom accessibility',()=>{
  const css=read('assets/vault-refresh.css');
  const html=read('assets/index.html');
  const preview=read('preview/index.html');
  assert.match(css, /max-width:640px/);
  assert.match(css, /max-width:355px/);
  assert.ok(css.includes('.cards-grid,.qc-account-list{grid-template-columns:minmax(0,1fr)!important'));
  assert.match(css, /\.tab-group\{display:flex!important;flex-wrap:nowrap!important;overflow-x:auto/);
  assert.match(preview, /max-width:355px/);
  assert.doesNotMatch(html, /user-scalable=no/);
});


test('wallet-facing preview has no design handoff panel and includes safe demo interactions',()=>{
  const html=read('preview/wallet.html');
  assert.match(html,/My cards/);
  assert.match(html,/id="view-wallet"/);
  assert.match(html,/id="view-expiring"/);
  assert.match(html,/id="view-insights"/);
  assert.match(html,/id="view-family"/);
  assert.match(html,/id="view-settings"/);
  assert.match(html,/id="addForm"/);
  assert.doesNotMatch(html,/Implementation direction|Implementation note|Adopt this direction|Planned quick actions/);
  assert.doesNotMatch(html,/https:\/\/[^"']+/);
  assert.match(html,/Sample data only/);
});

test('authenticated wallet view hooks into existing guarded Supabase actions',()=>{
  const app=read('assets/index.html'),wallet=read('assets/wallet-live.js'),css=read('assets/wallet-live.css');
  new vm.Script(wallet);
  assert.match(app,/wallet-live\.js/);
  assert.match(app,/wallet-live\.css/);
  assert.match(app,/window\.giftVaultLiveBridge/);
  assert.match(app,/window\.walletLiveStart/);
  assert.match(app,/window\.walletLiveRefresh/);
  assert.match(app,/canCurrentUserRevealCode\(c\)/);
  assert.match(app,/revealCouponCode\(id\)/);
  assert.match(wallet,/data-act="add"/);
  assert.match(wallet,/data-act="spend"/);
  assert.match(wallet,/data-act="remind"/);
  assert.match(wallet,/data-act="edit"/);
  assert.match(wallet,/data-act="request"/);
  assert.match(wallet,/wl-view-insights/);
  assert.match(wallet,/wl-view-family/);
  assert.match(css,/#appScreen\.wallet-mode/);
  assert.doesNotMatch(wallet,/localStorage|sessionStorage|service_role|sb_secret_/);
});
test('wallet monetary totals use existing INR data until currency migration',()=>{
  const wallet=read('assets/wallet-live.js');
  assert.match(wallet,/currency:"INR"/);
  assert.doesNotMatch(wallet,/C\$1,245\.00|Sample data only/);
});


test('wallet provides a return route and prevents overdrawn manual redemptions',()=>{
  const html=read('assets/index.html');
  assert.match(html,/id="returnWalletBtn"/);
  assert.match(html,/spent > Number\(c\.amount\)/);
  assert.match(html,/Math\.round\(spent \* 100\) \/ 100 !== spent/);
  assert.match(html,/if \(!dateStr\) return Infinity;/);
});
