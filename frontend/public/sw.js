const CACHE_NAME = "fishdex-v1";
// Separate, long-lived cache for map tiles — kept out of the version bump
// below on purpose. The app only ever covers the San Diego area, so the set
// of tiles across the zoom levels actually used is small and essentially
// static; there's no reason to keep re-fetching them from CARTO every visit.
const TILE_CACHE_NAME = "fishdex-tiles-v1";
const PRECACHE_URLS = ["/", "/manifest.json"];

function isTileRequest(url) {
  return url.hostname.endsWith("basemaps.cartocdn.com");
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
        cache.put(event.request, response.clone());
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
