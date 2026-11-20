/* Static assets only. Never cache responses from Supabase or private card data. */
const VERSION='gift-vault-static-v2';
const ASSETS=['./vault-refresh.css','./vault-enhancements.js','./vault-icons.js','./vault-icon.svg','./manifest.webmanifest'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(VERSION).then(c=>c.addAll(ASSETS)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('gift-vault-static-')&&k!==VERSION).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;const u=new URL(e.request.url);if(u.origin!==location.origin)return;if(!ASSETS.some(p=>u.pathname.endsWith(p.slice(1))))return;e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request)))});
