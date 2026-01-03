const CACHE_NAME = 'color-wheel-cache-v2';
const urlsToCache = [
  '/',
  '/index.html',
  '/styles.css',
  '/script.js',
  '/lut_utils.js',
  '/luts/InvRRT.sRGB.Log2_48_nits_Shaper.spi3d',
  '/luts/Log2_48_nits_Shaper_to_linear.spi1d',
  '/icon-192x192.png',
  '/icon-512x512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => response || fetch(event.request))
  );
});