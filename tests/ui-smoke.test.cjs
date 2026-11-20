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
  assert.match(css, /\.cards-grid\{grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css, /\.tab-group\{display:flex!important;flex-wrap:nowrap!important;overflow-x:auto/);
  assert.match(preview, /max-width:355px/);
  assert.doesNotMatch(html, /user-scalable=no/);
});
