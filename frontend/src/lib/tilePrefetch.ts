// This app only ever covers the San Diego area, so rather than relying
// purely on lazy loading + a preload buffer while panning (which can never
// fully eliminate a blank edge on a fast pan into never-before-seen
// territory), we background-prefetch every tile for the whole area once and
// store it in the same persistent cache the service worker's tile
// cache-first handler reads from (see public/sw.js's TILE_CACHE_NAME) — so
// normal browsing/panning never needs the network at all after the first
// visit. The deepest zoom level (used only for the rare "zoom into one
// specific catch" view) is deliberately excluded — it's ~4x the tile count
// of everything else combined for a view that's narrow, occasional, and
// caches almost instantly on its own the few times it's actually used.
import { STADIA_API_KEY } from "../leafletSetup";

const TILE_CACHE_NAME = "fishdex-tiles-v1";
const MIN_ZOOM = 9;
const MAX_ZOOM = 14;
const BOUNDS = { minLat: 32.45, maxLat: 33.35, minLng: -117.65, maxLng: -116.75 };
// Modest concurrency — enough to be fast without hammering Stadia's rate
// limits or the user's connection with thousands of simultaneous requests.
const CONCURRENCY = 8;

function lonToTileX(lon: number, z: number): number {
  return Math.floor(((lon + 180) / 360) * 2 ** z);
}

function latToTileY(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z);
}

function buildTileUrls(styleUrlTemplate: (z: number, x: number, y: number) => string): string[] {
  const urls: string[] = [];
  for (let z = MIN_ZOOM; z <= MAX_ZOOM; z++) {
    const x1 = lonToTileX(BOUNDS.minLng, z);
    const x2 = lonToTileX(BOUNDS.maxLng, z);
    const y1 = latToTileY(BOUNDS.maxLat, z);
    const y2 = latToTileY(BOUNDS.minLat, z);
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
      for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
        urls.push(styleUrlTemplate(z, x, y));
      }
    }
  }
  return urls;
}

async function fetchWithConcurrency(urls: string[], cache: Cache): Promise<void> {
  let index = 0;
  async function worker() {
    while (index < urls.length) {
      const url = urls[index++];
      try {
        const existing = await cache.match(url);
        if (existing) continue;
        const res = await fetch(url);
        if (res.ok) await cache.put(url, res);
      } catch {
        /* Best-effort — a single failed/offline tile just stays lazy-loaded later. */
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
}

// Fire-and-forget: never awaited by a caller, never blocks rendering. Safe
// to call on every Map page visit — already-cached tiles are skipped via
// cache.match before ever hitting the network, so repeat calls are cheap.
export function prefetchSanDiegoTiles(): void {
  if (!("caches" in window) || !STADIA_API_KEY) return;
  // Must match exactly what Leaflet's TileLayer (detectRetina) actually
  // requests at runtime — it appends "@2x" before the extension on retina
  // displays, same {r} substitution Leaflet itself does internally. A
  // prefetched entry that doesn't share the exact request URL is invisible
  // to the cache-first handler and never gets used.
  const retinaSuffix = window.devicePixelRatio > 1 ? "@2x" : "";
  const urls = buildTileUrls(
    (z, x, y) =>
      `https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/${z}/${x}/${y}${retinaSuffix}.png?api_key=${STADIA_API_KEY}`
  );
  caches.open(TILE_CACHE_NAME).then((cache) => fetchWithConcurrency(urls, cache));
}
