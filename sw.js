const LEGACY_CACHE_PREFIX='acelynn-pro-';
const MIGRATION_SHELL='/api/demo-shell.js';

self.addEventListener('install',event=>{self.skipWaiting()});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key.startsWith(LEGACY_CACHE_PREFIX)).map(key=>caches.delete(key)));
    await self.clients.claim();

    // The production domain currently serves a static index at /. Force already-open legacy
    // WebViews through one fresh navigation after this worker activates so the migration shell
    // below takes control without requiring the user to clear data or reinstall anything.
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    await Promise.all(windows.map(client=>{
      try{
        const url=new URL(client.url);
        if(url.origin===self.location.origin&&(url.pathname==='/'||url.pathname==='/index.html')){
          return client.navigate(url.href);
        }
      }catch(error){}
      return Promise.resolve();
    }));
  })());
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.mode!=='navigate')return;

  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;
  if(url.pathname!=='/'&&url.pathname!=='/index.html')return;

  // No cache is written. Only legacy root navigations are replaced with the server-generated
  // shell that injects legacy-export-bridge.js. All other requests remain normal network traffic.
  event.respondWith(fetch(MIGRATION_SHELL,{cache:'no-store',credentials:'same-origin'}));
});
