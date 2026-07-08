const CACHE_NAME = "fishdex-v1";
// Separate, long-lived cache for map tiles — kept out of the version bump
// below on purpose. The app only ever covers the San Diego area, so the set
// of tiles across the zoom levels actually used is small and essentially
// static; there's no reason to keep re-fetching them from the tile provider
// every visit.
const TILE_CACHE_NAME = "fishdex-tiles-v2";
const PRECACHE_URLS = ["/", "/manifest.json"];

function isTileRequest(url) {
  return url.hostname.endsWith("tiles.stadiamaps.com");
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  const keep = [CACHE_NAME, TILE_CACHE_NAME];
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => !keep.includes(key)).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);

  if (isTileRequest(url)) {
    // Cache-first, no expiration — map tiles for this fixed small area
    // don't go stale, so once a tile is fetched it's served instantly from
    // here on out instead of a network round trip every time.
    event.respondWith(
      caches.open(TILE_CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        const response = await fetch(event.request);
        // Only cache real tiles. fetch() resolves (doesn't throw) on HTTP
        // error responses too (a Stadia rate limit, a momentary 401, ...) —
        // caching those into a no-expiration cache would make one bad
        // response a permanent broken tile, never retried on the next pan.
        if (response.ok) {
          cache.put(event.request, response.clone());
        }
        return response;
      })
    );
    return;
  }

  // Network-first so logged-in/API data is never served stale; falls back
  // to cache only when offline.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || "Fish Pokedex", {
      body: data.body || "",
      icon: "/icon-192.png",
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window" }).then((windowClients) => {
      const existing = windowClients.find((client) => client.url.includes(url));
      if (existing) return existing.focus();
      return clients.openWindow(url);
    })
  );
});
