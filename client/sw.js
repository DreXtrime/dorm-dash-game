self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
    }).then(() => {
      return self.registration.unregister();
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // Completely bypass cache and force network fetch to bust all caches
  const url = new URL(e.request.url);
  url.searchParams.set('bust', Date.now());
  
  e.respondWith(
    fetch(url.toString(), { cache: 'no-store' }).catch(() => fetch(e.request))
  );
});
