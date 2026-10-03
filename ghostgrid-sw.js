const CACHE_NAME = 'ghostgrid-offline-v9-offline-kit';
const SHELL_URL = './index.html';
const PRECACHE = [
  './',
  './index.html',
  './ghostgrid-manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Best-effort: icons may not be deployed in the prototype package.
    await Promise.all(PRECACHE.map(url => cache.add(url).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Live presence traffic must never be cached or proxied through the cache:
  // /events is an endless Server-Sent Events stream and /api/* is real-time state.
  if (url.origin === self.location.origin &&
      (url.pathname === '/events' || url.pathname.startsWith('/api/'))) return;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);

    try {
      const response = await fetch(req);
      if (response.ok && response.type === 'basic' && url.origin === self.location.origin) {
        event.waitUntil(cache.put(req, response.clone()).catch(() => {}));
      }
      return response;
    } catch (_) {
      const cached = await cache.match(req, { ignoreSearch: true });
      if (cached) return cached;

      if (req.mode === 'navigate') {
        const shell = await cache.match(SHELL_URL);
        if (shell) return shell;
      }

      return new Response(
        'GhostGrid is offline and this resource is not cached yet.',
        { status: 503, headers: { 'Content-Type': 'text/plain' } }
      );
    }
  })());
});
