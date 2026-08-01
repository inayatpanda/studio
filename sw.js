// Minimal service worker — enables "Add to Home Screen" / installable PWA.
// Network-first; we never want stale drafts, so we don't aggressively cache.
const CACHE = 'studio-v75';
const SHELL = ['/', '/index.html', '/manifest.json', '/icon.svg', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png', '/resize.js', '/preview.css'];

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
  // never cache API calls
  if (url.pathname.includes('/api/')) return;
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request).then((r) => r || caches.match('/')))
  );
});
