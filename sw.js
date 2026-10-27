const CACHE='fc27-desk-v5-assets';const STATIC=['./','./index.html','./app.js?v=5.0.0','./engine.mjs','./market-engine.mjs','./styles.css?v=5.0.0','./icon.svg','./manifest.webmanifest'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(STATIC)).catch(()=>{}))});
self.addEventListener('activate',e=>{e.waitUntil(Promise.all([clients.claim(),caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x))))]))});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(u.origin!==self.location.origin||e.request.method!=='GET')return;e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy))}return r}).catch(()=>caches.match(e.request)))});
