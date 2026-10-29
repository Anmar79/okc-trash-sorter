// Minimal service worker: caches the app shell so it installs cleanly and
// opens instantly on repeat visits. Classification calls always go to the
// network (they need a fresh AI response), so we don't cache /api/*.
const CACHE_NAME = "trash-sorter-v1";
const APP_SHELL = ["/", "/index.html", "/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/")) return; // never cache API calls

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
