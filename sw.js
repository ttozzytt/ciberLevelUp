'use strict';

const CACHE_NAME = 'levelup-cibercafe-v11-pc-ps5-tarifas';
const APP_SHELL = [
  './',
  './index.html',
  './pwa.html',
  './index.css',
  './pwa.css',
  './index.js',
  './pwa.js',
  './manifest.json',
  './data/computadoras.json',
  './data/consolas.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './imagenes/pc-gamer.webp',
  './imagenes/pc-basica.webp',
  './imagenes/pc-estandar.webp',
  './imagenes/pc-premium.webp',
  './imagenes/playstation.webp'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key.startsWith('levelup-cibercafe-') && key !== CACHE_NAME)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // El health-check debe salir a la red: nunca se responde desde Cache Storage.
  if (url.searchParams.has('__levelup_health')) {
    event.respondWith(fetch(request));
    return;
  }

  // Navegación: primero intenta la versión publicada; si falla, usa la copia local.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then(response => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      }).catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const path = url.pathname.endsWith('/pwa.html') ? './pwa.html' : './index.html';
        return (await caches.match(path)) || Response.error();
      })
    );
    return;
  }

  // JSON: red primero para recibir datos recientes y caché como respaldo offline.
  if (url.pathname.endsWith('/data/computadoras.json') || url.pathname.endsWith('/data/consolas.json')) {
    event.respondWith(
      fetch(request).then(response => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      }).catch(async () => (await caches.match(request)) || (await caches.match('./data/computadoras.json')) || Response.error())
    );
    return;
  }

  // CSS, JavaScript, iconos e imágenes: caché primero para mantener la interfaz disponible.
  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
      }
      return response;
    }))
  );
});
