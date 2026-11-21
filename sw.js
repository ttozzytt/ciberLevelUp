'use strict';

const CACHE_NAME = 'levelup-cibercafe-v42-supabase-offline-queue';
const APP_SHELL = [
  './',
  './index.html',
  './pwa.html',
  './index.css',
  './pwa.css?v=c3a2-user-images-services-20261121-r3',
  './index.js',
  './pwa.js?v=levelup-supabase-offline-queue-r8',
  './theme.css',
  './js/security-and-vitals.js',
  './js/supabase-client.js?v=levelup-supabase-auth-phone-password-r2',
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
  './imagenes/mando-adicional-ps5.jpg'
];
const OPTIONAL_CDN_ASSETS = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);
    // El SDK es opcional para completar la instalación. Si hay red, queda en caché
    // para restaurar la sesión mientras la PWA está offline; las llamadas a Supabase
    // esperan a que vuelva Internet.
    for (const asset of OPTIONAL_CDN_ASSETS) {
      try {
        const response = await fetch(new Request(asset, { mode: 'cors', cache: 'reload' }));
        if (response && response.ok) await cache.put(asset, response.clone());
      } catch (error) {
        console.warn('No se pudo precargar el SDK de Supabase; la instalación PWA continúa.', error);
      }
    }
    await self.skipWaiting();
  })());
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
  // SDK de Supabase: sirve la copia local offline y actualiza la caché cuando hay red.
  if (OPTIONAL_CDN_ASSETS.includes(url.href)) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      } catch (error) {
        return new Response('El SDK de Supabase todavía no está almacenado en este dispositivo.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
        });
      }
    })());
    return;
  }
  // Las imágenes propias se incluyen en el CSS local y quedan disponibles Offline.
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
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response && response.ok) {
          // Guarda cada JSON con su propia URL. Nunca uses computadoras.json como
          // sustituto de consolas.json: ambos catálogos tienen esquemas distintos.
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
