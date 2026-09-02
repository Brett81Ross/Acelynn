const LEGACY_CACHE_PREFIX='acelynn-pro-';
self.addEventListener('install',event=>{self.skipWaiting()});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key.startsWith(LEGACY_CACHE_PREFIX)).map(key=>caches.delete(key)));
    await self.registration.unregister();
    await self.clients.claim();
  })());
});
// Intentionally no fetch handler. This worker exists only to retire the legacy cache/service worker.
