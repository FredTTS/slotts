const CACHE_NAME = 'smart-golf-v2';
const base = (self.location.pathname.replace(/\/sw\.js$/, '') || '') + '/';
const urlsToCache = [
  base,
  base + 'index.html',
  base + 'styles.css',
  base + 'app.js',
  base + 'manifest.json',
  base + 'map.geojson',
  ...Array.from({ length: 18 }, (_, i) => base + `img/s${i + 1}.jpeg`)
].map((u) => new URL(u, self.location.origin).href);

// Install event - cache files (en fil som misslyckas hindrar inte övriga)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(
        urlsToCache.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('Cache misslyckades för:', url, err);
          })
        )
      )
    )
  );
  self.skipWaiting();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Cache hit - return response
        if (response) {
          return response;
        }
        
        // Clone the request
        const fetchRequest = event.request.clone();
        
        return fetch(fetchRequest).then((response) => {
          // Check if valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          
          // Clone the response
          const responseToCache = response.clone();
          
          // Don't cache weather API calls
          if (!event.request.url.includes('openweathermap.org')) {
            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });
          }
          
          return response;
        });
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  
  return self.clients.claim();
});
