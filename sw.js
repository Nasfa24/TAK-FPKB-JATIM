// sw.js - Service worker Lebah Indrapura
const CACHE = 'lebah-indrapura-v2';
const ASET = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASET)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Navigasi, skrip, dan gaya: jaringan dulu supaya pembaruan keamanan tidak tertahan cache.
// Gambar dan ikon: cache dulu supaya cepat.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const jaringanDulu = req.mode === 'navigate'
    || req.destination === 'script'
    || req.destination === 'style'
    || req.destination === 'document';

  if (jaringanDulu) {
    event.respondWith(
      fetch(req).then((res) => {
        const kopi = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, kopi));
        return res;
      }).catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((r) => r || fetch(req).then((res) => {
      const kopi = res.clone();
      caches.open(CACHE).then((cache) => cache.put(req, kopi));
      return res;
    }))
  );
});
