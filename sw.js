const CACHE = 'ficha-terreno-v5';
const ASSETS = ['./index.html','./app.js','./manifest.json','./icon-192.png','./icon-512.png'];

self.addEventListener('install', e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
  self.skipWaiting(); // activa inmediatamente sin esperar cierre
});

self.addEventListener('activate', e=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
  );
  self.clients.claim(); // toma control de todas las pestañas abiertas al instante
});

self.addEventListener('fetch', e=>{
  e.respondWith(
    caches.open(CACHE).then(cache=>
      fetch(e.request).then(res=>{
        cache.put(e.request, res.clone());
        return res;
      }).catch(()=>cache.match(e.request))
    )
  );
});
