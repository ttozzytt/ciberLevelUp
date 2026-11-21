'use strict';
const CACHE='levelup-course-w3-cwv-v2';
const PREFIX='levelup-course-w3-cwv-';
const SHELL=["./","./index.html","./manifest.json","./script.js","../../styles.css","../../assets/icon.svg"];
self.addEventListener('install',event=>event.waitUntil((async()=>{const c=await caches.open(CACHE);await c.addAll(SHELL);await self.skipWaiting();})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)));await self.clients.claim();})()));
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;event.respondWith((async()=>{const c=await caches.open(CACHE),cached=await c.match(event.request);if(cached)return cached;try{const response=await fetch(event.request);if(response.ok)c.put(event.request,response.clone());return response;}catch(error){if(event.request.mode==='navigate')return(await c.match('./index.html'))||Response.error();return Response.error();}})());});
