'use strict';
const CACHE='levelup-course-w2-offline-v2';
const PREFIX='levelup-course-w2-offline-';
const SHELL=["./","./index.html","./manifest.json","./script.js","../../styles.css","../../assets/icon.svg"];
self.addEventListener('install',event=>event.waitUntil((async()=>{const c=await caches.open(CACHE);await c.addAll(SHELL);await self.skipWaiting();})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)));await self.clients.claim();})()));
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;event.respondWith((async()=>{const c=await caches.open(CACHE),cached=await c.match(event.request);if(cached)return cached;try{const response=await fetch(event.request);if(response.ok)c.put(event.request,response.clone());return response;}catch(error){if(event.request.mode==='navigate')return(await c.match('./index.html'))||Response.error();return Response.error();}})());});

function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open('levelup-course-offline-practice',1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('pending'))r.result.createObjectStore('pending',{keyPath:'id',autoIncrement:true});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function queueRows(){const d=await openDB();return new Promise((resolve,reject)=>{const tx=d.transaction('pending','readonly'),r=tx.objectStore('pending').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);tx.oncomplete=()=>d.close();});}
async function removeRow(id){const d=await openDB();return new Promise((resolve,reject)=>{const tx=d.transaction('pending','readwrite');tx.objectStore('pending').delete(id);tx.oncomplete=()=>{d.close();resolve();};tx.onerror=()=>reject(tx.error);});}
async function flushPending(){for(const row of await queueRows()){const response=await fetch('./api/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(row)});if(!response.ok)throw new Error('Endpoint de práctica sin confirmar: HTTP '+response.status);await removeRow(row.id);}}
self.addEventListener('sync',event=>{if(event.tag==='course-offline-sync')event.waitUntil(flushPending());});