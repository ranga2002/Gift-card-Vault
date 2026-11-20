'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=p=>fs.readFileSync(new URL('../'+p,'file://'+__filename),'utf8');
test('scripts parse',()=>{new vm.Script(read('assets/vault-enhancements.js'));new vm.Script(read('assets/sw.js'))});
test('website includes redesign and filters',()=>{const html=read('assets/index.html');assert.match(html,/vault-refresh\.css/);assert.match(html,/vault-enhancements\.js/);assert.match(html,/vaultFilterSearch/);assert.match(html,/vaultInsights/)});
test('calendar does not expose revealed card code',()=>{assert.doesNotMatch(read('assets/index.html'),/const revealed = c\.id \? revealedSecrets\[c\.id\]/)});
test('legacy unauthenticated API removed',()=>{const server=read('cloud_server.js');assert.doesNotMatch(server,/Admin@1234|X-Vault-User-Id|\/api\/vault/)});
test('PWA caches only static resources',()=>{const cache=read('assets/sw.js');assert.doesNotMatch(cache,/supabase-config|coupon_secrets|\/api\//);assert.equal(JSON.parse(read('assets/manifest.webmanifest')).display,'standalone')});

test('outline icons parse and are referenced by the app',()=>{new vm.Script(read('assets/vault-icons.js'));assert.match(read('assets/index.html'),/vault-icons\\.js/);assert.match(read('assets/vault-refresh.css'),/\\.ui-icon/)});
test('standalone preview uses SVG outline icons, not emoji',()=>{const p=read('preview/index.html');assert.match(p,/class="ui-icon"/);assert.doesNotMatch(p,/[🎁🎟️🔔🔐🛍️📅🌐]/u);assert.match(p,/PREVIEW ONLY/)});
