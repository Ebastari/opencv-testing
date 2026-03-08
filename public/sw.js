const APP_SHELL_CACHE = 'montana-app-shell-v2';
const RUNTIME_CACHE = 'montana-runtime-v1';

const APP_SHELL_ASSETS = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon.svg'];

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
          .filter((key) => key !== APP_SHELL_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key)),
      );
    }).then(() => self.clients.claim()),
  );
});

const RUNTIME_CACHE_LIMIT = 80;
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

self.addEventListener('fetch', (event) => {
  const { request } = event;

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
