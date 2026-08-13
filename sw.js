// RameshVerse — minimal service worker.
// Goal: make the site installable and usable offline for pages already
// visited, WITHOUT aggressively caching tool pages (which are updated
// often) — so people always get the latest version when online, and
// only fall back to a cached copy when there's no connection at all.

const CACHE_NAME = "rameshverse-shell-v1";
const SHELL_ASSETS = [
  "/",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle GET requests for our own origin
  if (request.method !== "GET" || new URL(request.url).origin !== location.origin) {
    return;
  }

  // Network-first: try the live version, fall back to cache only if
  // offline. This means tool updates are never blocked by a stale cache.
  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request))
  );
});
