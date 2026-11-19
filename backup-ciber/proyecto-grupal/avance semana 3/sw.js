'use strict';

const CACHE_NAME = 'levelup-backup-ciber-grupal-v1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/layout.css',
  './css/modulos/cabecera.css',
  './css/modulos/catalogo.css',
  './css/modulos/formulario.css',
  './css/modulos/panel.css',
  './js/layout.js',
  './js/modulos/cabecera.js',
  './js/modulos/catalogo.js',
  './js/modulos/formulario.js',
  './js/modulos/panel.js',
  '../../icons/icon-192.png',
  '../../icons/icon-512.png',
  '../../data/computadoras.json',
  '../../data/consolas.json',
  '../../imagenes/pc-basica.webp',
  '../../imagenes/pc-estandar.webp',
  '../../imagenes/pc-premium.webp',
  '../../imagenes/playstation.webp',
  '../../imagenes/imagen-respaldo.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith('levelup-backup-ciber-grupal-') && key !== CACHE_NAME)
      .map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(caches.match(event.request).then(cached => {
    if (cached) return cached;
    return fetch(event.request).then(response => {
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      }
      return response;
    }).catch(() => {
      if (event.request.mode === 'navigate') return caches.match('./index.html');
      return Response.error();
    });
  }));
});