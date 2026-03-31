const CACHE_NAME = 'pdf-remover-v4'; // Incremented version to force update
const CORE_ASSETS = [
  './',
  'index.html',
  'main.js',
  'style.css',
  'manifest.json'
];

const STATIC_ASSETS = [
  'wheels/pymupdf-1.27.1-cp313-none-pyodide_2025_0_wasm32.whl'
];

// Files that should always try to fetch from network first (to get latest logic)
const NETWORK_FIRST_PATHS = [
    'python_core/', 
    'main.js', 
    'index.html',
    'worker.js'
];

// Install: Cache essential assets
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // We cache everything initially
      return cache.addAll([...CORE_ASSETS, ...STATIC_ASSETS]);
    })
  );
});

// Activate: Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// Fetch: Hybrid Strategy
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  
  // Strategy 1: Network First (for logic files)
  // This ensures users get the latest python scripts and main.js if they are online.
  // We use .includes() to be safe with subdirectory deployments (e.g. /pdf-processor/main.js)
  const isNetworkFirst = NETWORK_FIRST_PATHS.some(path => url.pathname.includes(path)) || url.pathname.endsWith('/');

  if (isNetworkFirst) {
      event.respondWith(
        fetch(event.request)
          .then((networkResponse) => {
            // Update cache with new version
            if (networkResponse && networkResponse.status === 200) {
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseToCache);
                });
            }
            return networkResponse;
          })
          .catch(() => {
            // Network failed, fall back to cache
            console.log('[Service Worker] Network unavailable, falling back to cache for:', event.request.url);
            return caches.match(event.request);
          })
      );
      return;
  }

  // Strategy 2: Cache First, falling back to Network (for libs, wheels, images)
  // This provides speed for large files.
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200) {
          return networkResponse;
        }

        // Cache Pyodide CDN and local static assets dynamically
        if (url.protocol.startsWith('http')) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
        }

        return networkResponse;
      });
    })
  );
});