'use strict';

const CACHE_NAME = 'levelup-backup-cibercafe-v18-final-shell-20261121';
const APP_SHELL = [
  './',
  './index.html',
  './pwa.html',
  './index.css?v=20261117-theme-1',
  './pwa.css?v=backup-ciber-layout-final-20261121',
  './css/layout.css?v=backup-ciber-final-layout-20261121',
  './index.js',
  './pwa.js?v=backup-ciber-clean-20261121',
  './theme.css?v=backup-ciber-clean-20261121',
  './card-simulation.css?v=backup-ciber-clean-20261121',
  './card-simulation.js?v=backup-ciber-clean-20261121',
  './js/security-and-vitals.js',
  './manifest.json',
  './data/computadoras.json?v=16',
  './data/consolas.json?v=16',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './imagenes/pc-gamer.webp',
  './imagenes/pc-basica.webp',
  './imagenes/pc-estandar.webp',
  './imagenes/pc-premium.webp',
  './imagenes/playstation.webp',
  './imagenes/snack-papas-georges.jpg',
  './imagenes/snack-nachos-picantes.jpg',
  './imagenes/snack-chizitos-queso.jpg',
  './imagenes/bebida-gaseosa-personal.jpg',
  './imagenes/comida-maruchan-vaso.jpg',
  './imagenes/accesorio-cascos-gamer.jpg',
  './imagenes/accesorio-mousepad-gamer.jpg',
  './imagenes/mando-adicional-ps5.jpg',
  './lab-jquery/index.html',
  './lab-jquery/styles.css',
  './lab-jquery/script.js',
  './lab-jquery/jquery.min.js',
  './lab-jquery/ejercicios/index.html',
  './lab-jquery/ejercicios/styles.css',
  './lab-jquery/ejercicios/01-hidratacion-boton/index.html',
  './lab-jquery/ejercicios/01-hidratacion-boton/script.js',
  './lab-jquery/ejercicios/01-hidratacion-boton/styles.css',
  './lab-jquery/ejercicios/02-memory-leaks-off-on/index.html',
  './lab-jquery/ejercicios/02-memory-leaks-off-on/script.js',
  './lab-jquery/ejercicios/02-memory-leaks-off-on/styles.css',
  './lab-jquery/ejercicios/03-event-bubbling-delegacion/index.html',
  './lab-jquery/ejercicios/03-event-bubbling-delegacion/script.js',
  './lab-jquery/ejercicios/03-event-bubbling-delegacion/styles.css',
  './lab-jquery/ejercicios/04-reserva-segura-xss/index.html',
  './lab-jquery/ejercicios/04-reserva-segura-xss/script.js',
  './lab-jquery/ejercicios/04-reserva-segura-xss/styles.css',
  './lab-jquery/ejercicios/05-lista-dinamica-segura/index.html',
  './lab-jquery/ejercicios/05-lista-dinamica-segura/script.js',
  './lab-jquery/ejercicios/05-lista-dinamica-segura/styles.css',
  './lab-jquery/ejercicios/06-catalogo-asincrono-lazy/index.html',
  './lab-jquery/ejercicios/06-catalogo-asincrono-lazy/script.js',
  './lab-jquery/ejercicios/06-catalogo-asincrono-lazy/styles.css',
  './lab-jquery/ejercicios/07-diagnostico-html-dom/index.html',
  './lab-jquery/ejercicios/07-diagnostico-html-dom/script.js',
  './lab-jquery/ejercicios/07-diagnostico-html-dom/styles.css',
  './lab-jquery/ejercicios/06-catalogo-asincrono-lazy/data/catalogo.json',
  './lab-jquery/ejercicios/06-catalogo-asincrono-lazy/assets/producto-ejemplo.svg',
  './lab-jquery/ejercicios/06-catalogo-asincrono-lazy/manifest.json',
  './lab-jquery/ejercicios/06-catalogo-asincrono-lazy/sw.js',
  './lab-jquery/ejercicios/06-catalogo-asincrono-lazy/icons/icon-192.png',
  './lab-jquery/ejercicios/06-catalogo-asincrono-lazy/icons/icon-512.png',
  './imagenes/imagen-respaldo.svg'
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
        .filter(key => key.startsWith('levelup-backup-cibercafe-') && key !== CACHE_NAME)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.searchParams.has('__levelup_health')) {
    event.respondWith(fetch(request));
    return;
  }

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

  if (url.pathname.endsWith('/data/computadoras.json') || url.pathname.endsWith('/data/consolas.json')) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response && response.ok) {
          try {
            const cache = await caches.open(CACHE_NAME);
            const cacheKey = new Request(url.href, { method: 'GET', credentials: 'same-origin' });
            await cache.put(cacheKey, response.clone());
          } catch (cacheError) {
            console.warn('No se pudo actualizar la copia local del catálogo:', cacheError);
          }
        }
        return response;
      } catch (networkError) {
        const cached = await caches.match(request, { ignoreSearch: true });
        if (cached) return cached;
        return new Response(JSON.stringify({
          error: 'catalog_unavailable',
          file: url.pathname.split('/').pop(),
          message: 'No hay conexión y este catálogo todavía no está guardado en el dispositivo.'
        }), {
          status: 503,
          headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
        });
      }
    })());
    return;
  }

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
