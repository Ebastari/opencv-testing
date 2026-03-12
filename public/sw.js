const APP_SHELL_CACHE = 'montana-app-shell-v3';
const RUNTIME_CACHE = 'montana-runtime-v2';
const API_CACHE = 'montana-api-v1';
const OFFLINE_URL = '/offline.html';

const APP_SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon.svg',
];

// Static assets that should always be cached
const STATIC_ASSETS = [
  /\.(?:js|css|html|png|jpg|jpeg|svg|webp|ico|woff2?|ttf|json|webmanifest)$/,
];

// API endpoints that should be cached
const API_PATTERNS = [
  /\/api\/entries/,
  /\/api\/analytics/,
  /\/_next\/data\//,
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL_ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) =>
            key !== APP_SHELL_CACHE &&
            key !== RUNTIME_CACHE &&
            key !== API_CACHE
          )
          .map((key) => caches.delete(key)),
      );
    }).then(() => self.clients.claim()),
  );
});

const RUNTIME_CACHE_LIMIT = 80;
const API_CACHE_LIMIT = 50;

const trimCache = async (cacheName, maxItems) => {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxItems) {
    await cache.delete(keys[0]);
    if (keys.length - 1 > maxItems) {
      await trimCache(cacheName, maxItems);
    }
  }
};

const isStaticAssetRequest = (request) => {
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return false;
  }

  return /\.(?:js|css|html|png|jpg|jpeg|svg|webp|ico|woff2?|ttf|json|webmanifest)$/.test(url.pathname);
};

const isApiRequest = (request) => {
  const url = new URL(request.url);
  return API_PATTERNS.some((pattern) => pattern.test(url.pathname));
};

const isApiGetRequest = (request) => {
  return request.method === 'GET' && isApiRequest(request);
};

// Handle API requests with network-first strategy
const handleApiRequest = async (request) => {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(API_CACHE);
      cache.put(request, response.clone());
      trimCache(API_CACHE, API_CACHE_LIMIT);
    }
    return response;
  } catch (error) {
    // Try to get from cache
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    throw error;
  }
};

// Handle background sync
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-entries') {
    event.waitUntil(syncEntries());
  }
});

const syncEntries = async () => {
  // Get pending entries from IndexedDB and sync
  // This is handled by the main app sync service
  const clients = await self.clients.matchAll();
  clients.forEach((client) => {
    client.postMessage({ type: 'SYNC_TRIGGERED' });
  });
};

// Handle messages from main app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((keys) => {
        return Promise.all(keys.map((key) => caches.delete(key)));
      })
    );
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Handle API GET requests with network-first strategy
  if (isApiGetRequest(request)) {
    event.respondWith(handleApiRequest(request));
    return;
  }

  if (request.method !== 'GET') {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => {
          const runtimeMatch = await caches.match(request);
          if (runtimeMatch) {
            return runtimeMatch;
          }
          const appShell = await caches.match('/index.html');
          return appShell || Response.error();
        }),
    );
    return;
  }

  if (isStaticAssetRequest(request)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request)
          .then((response) => {
            const copy = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => {
              cache.put(request, copy);
              trimCache(RUNTIME_CACHE, RUNTIME_CACHE_LIMIT);
            });
            return response;
          })
          .catch(() => cached);

        return cached || fetchPromise;
      }),
    );
  }
});
