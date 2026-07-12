/* ALPJ Ranch service worker — offline app shell + data caching */
const CACHE = 'alpj-ranch-v1';
const CORE = [
  './', './index.html', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-180.png',
  './data/index.json', './data/home.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(CORE).catch(() => {});
    // also cache every plant JSON listed in the index
    try {
      const idx = await (await fetch('./data/index.json')).json();
      await cache.addAll((idx.plants || []).map((p) => './data/' + p));
    } catch (_) {}
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Only handle same-origin GETs; let weather API + fonts hit the network directly.
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith((async () => {
    const cached = await caches.match(e.request);
    if (cached) return cached;
    try {
      const res = await fetch(e.request);
      const cache = await caches.open(CACHE);
      cache.put(e.request, res.clone());
      return res;
    } catch (_) {
      return cached || Response.error();
    }
  })());
});
