// Minimal Service Worker for PWABuilder / Android compliance
const CACHE_NAME = 'svn-tennis-pwa-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Pass-through fetch handler for PWABuilder compliance
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
