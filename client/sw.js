const CACHE_NAME = 'dorm-dash-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './ws-client.js',
  './ws-mock.js',
  './manifest.json',
  './assets/backgrounds/arena-bg.webp',
  './assets/backgrounds/arena-overlay.webp',
  './assets/backgrounds/join-bg.webp',
  './assets/sprites/camper-green.png',
  './assets/sprites/camper-red.png',
  './assets/sprites/camper-blue.png',
  './assets/sprites/camper-yellow.png',
  './assets/sprites/ember.png',
  './assets/sprites/cloud.png',
  './assets/sprites/powerup-bolt.png',
  './assets/sprites/powerup-shield.png',
  './assets/sprites/powerup-magnet.png',
  './assets/ui/panel-wood.png',
  './assets/ui/button-orange.png',
  './assets/ui/button-green.png',
  './assets/ui/logo.png',
  './assets/ui/icon-192.png',
  './assets/ui/icon-512.png',
  './assets/audio/start.mp3',
  './assets/audio/start.ogg',
  './assets/audio/pickup.mp3',
  './assets/audio/pickup.ogg',
  './assets/audio/powerup.mp3',
  './assets/audio/powerup.ogg',
  './assets/audio/cloud_hit.mp3',
  './assets/audio/cloud_hit.ogg',
  './assets/audio/win.mp3',
  './assets/audio/win.ogg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        // We use a safe cache strategy where missing files don't fail the whole install
        return Promise.allSettled(
          ASSETS_TO_CACHE.map(url => 
            fetch(url).then(response => {
              if (response.ok) {
                return cache.put(url, response);
              }
            }).catch(() => {
              // Ignore fetch errors for missing placeholder files
            })
          )
        );
      })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Cache-first strategy for static assets
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response; // Return from cache
        }
        return fetch(event.request); // Fallback to network
      })
  );
});
