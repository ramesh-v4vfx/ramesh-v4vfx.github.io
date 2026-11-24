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
const NETWORK_TIMEOUT_MS = 5000;   // on a bad connection, fall back to the cached copy instead of hanging

self.addEventListener("install", (event) => {
  event.waitUntil(
    // one missing icon must not stop the whole worker from installing
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(SHELL_ASSETS.map((url) => cache.add(url).catch(() => {})))
    )
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

// ---------------------------------------------------------------------------
// Push notifications (rv-notify) — independent of the caching logic above.
// ---------------------------------------------------------------------------
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data.json();
  } catch (e) {
    data = { title: "RameshVerse", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "RameshVerse";
  const options = {
    body: data.body || "",
    tag: data.tag || "rv-notify",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    renotify: true,
    data: { url: typeof data.url === "string" ? data.url : "/" }   // optional: lets a push open its own tool
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(target);
    })
  );
});

// ---------------------------------------------------------------------------
// Offline fallback: network first, cache only when the network fails.
// ---------------------------------------------------------------------------
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle GET requests for our own origin; skip range requests (video/audio)
  if (request.method !== "GET" || new URL(request.url).origin !== location.origin || request.headers.has("range")) {
    return;
  }

  event.respondWith(networkFirst(event, request));
});

async function networkFirst(event, request) {
  try {
    const response = await fetchWithTimeout(request, NETWORK_TIMEOUT_MS);
    // Only keep good, complete responses: never cache a 404/500 or a partial 206
    if (response && response.status === 200 && response.type === "basic") {
      const copy = response.clone();
      event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {})
      );
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    // Offline on a page never visited: show the home page instead of a browser error
    if (request.mode === "navigate") {
      const home = await caches.match("/");
      if (home) return home;
    }
    return Response.error();
  }
}

function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    fetch(request).then(
      (res) => { clearTimeout(timer); resolve(res); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}
