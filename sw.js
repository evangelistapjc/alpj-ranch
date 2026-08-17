// ALPJ Ranch service worker — MUST live at the site root so its scope covers
// the whole app. Cache-first for the app shell; network-first for JSON data.
const VERSION = 'alpj-24b3d998e0';
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './resources/css/stylesheet.css',
  './resources/js/main.js',
  './resources/js/config.js',
  './resources/js/state.js',
  './resources/js/store.js',
  './resources/js/sync.js',
  './resources/js/weather.js',
  './resources/js/climate.js',
  './resources/js/sun.js',
  './resources/js/rooms.js',
  './resources/js/views.js',
  './resources/js/actions.js',
  './resources/js/events.js',
  './resources/data/index.json',
  './resources/data/home.json',
  './resources/data/almanac.json',
  './resources/icons/icon-192.png',
  './resources/icons/icon-512.png',
  './resources/icons/icon-180.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // never cache the live weather API
  if (url.hostname.endsWith('open-meteo.com')) return;

  // network-first for our JSON data (so edits show up), fall back to cache
  if (url.pathname.includes('/resources/data/')){
    e.respondWith(
      fetch(request).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(request, copy));
        return res;
      }).catch(() => caches.match(request))
    );
    return;
  }

  // cache-first for everything else (app shell, fonts, icons)
  e.respondWith(
    caches.match(request).then((hit) => hit || fetch(request).then((res) => {
      if (res.ok && url.origin === location.origin){
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(request, copy));
      }
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
