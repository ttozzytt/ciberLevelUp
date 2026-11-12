const CACHE_NAME = 'levelup-cibercafe-v1';
const APP_SHELL = [
  './', './index.html', './manifest.json', './icons/icon-192.png', './icons/icon-512.png',
  './karaoke/', './karaoke/index.html', './karaoke/manifest.json', './karaoke/sw.js',
  './karaoke/css/styles.css', './karaoke/js/jquery.min.js', './karaoke/js/app.js',
  './karaoke/data/canciones.json', './karaoke/icons/icon-192.png', './karaoke/icons/icon-512.png',
  ...Array.from({length: 15}, (_, i) => `./karaoke/imagenes/portadas/portada-${String(i + 1).padStart(2, '0')}.svg`)
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('levelup-cibercafe-') && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => {
      if (response && response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
      return response;
    }).catch(async () => (await caches.match(request)) || (await caches.match('./index.html'))));
    return;
  }
  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    if (response && response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
    return response;
  })));
});
