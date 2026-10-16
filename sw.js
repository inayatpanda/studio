// Network-first app shell. Drafts live in IndexedDB; API responses are never cached.
const CACHE = 'studio-v96';
const SHELL = ['/', '/index.html', '/studio.js', '/studio-lib.js', '/premium.css', '/darkroom-upload.js', '/manifest.json', '/icon.svg', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png', '/resize.js', '/preview.css'];

// Cache the shell per-entry, NOT with addAll(): addAll() rejects the whole install if a
// SINGLE url 404s, which silently un-registers the worker and costs offline + installability.
// One missing asset should degrade that asset, not the app. (This is exactly how the hosted
// build broke: a stale '/' entry 404'd at the root and took the whole install with it.)
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(async (c) => {
    await Promise.all(SHELL.map((u) => c.add(u).catch(() => {})));
  }).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Never store credentials, third-party responses, mutations, or backend API data.
  if (e.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/api/')) return;
  e.respondWith(
    fetch(e.request).then(async (response) => {
      if (response.ok) {
        try {
          const cache = await caches.open(CACHE);
          await cache.put(e.request, response.clone());
        } catch { /* A full cache must not discard a successful network response. */ }
      }
      return response;
    }).catch(async () => {
      const cached = await caches.match(e.request);
      if (cached) return cached;
      if (e.request.mode === 'navigate') {
        const shell = await caches.match('/');
        if (shell) return shell;
      }
      return Response.error();
    })
  );
});
