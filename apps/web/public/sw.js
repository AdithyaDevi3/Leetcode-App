const CACHE_NAME = 'method-shell-v2';
const SHELL = ['/', '/offline'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !(event.request.mode === 'navigate' || url.pathname.startsWith('/_next/static/'))) return;
  event.respondWith(fetch(event.request).then((response) => {
    const isStaticAsset = url.pathname.startsWith('/_next/static/');
    const isHtml = response.headers.get('content-type')?.includes('text/html');
    if (isStaticAsset && response.ok && !isHtml) {
      const copy = response.clone();
      void caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
    }
    return response;
  }).catch(() => {
    if (event.request.mode === 'navigate') return caches.match('/offline');
    return caches.match(event.request);
  }));
});
