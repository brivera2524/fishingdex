interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

// A small in-memory TTL cache for live external data (tide, wind, ...) —
// cheap to serve briefly stale but expensive (a real network round trip) to
// refetch on every component mount/re-render. Concurrent callers for the
// same key (e.g. a wind badge and its detail sheet both wanting the same
// spot) share one in-flight request instead of firing duplicate calls.
export function cachedFetch<T>(key: string, ttlMs: number, fetchFn: () => Promise<T>): Promise<T> {
  const cached = cache.get(key) as CacheEntry<T> | undefined;
  if (cached && cached.expiresAt > Date.now()) {
    return Promise.resolve(cached.value);
  }

  const pending = inFlight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const promise = fetchFn()
    .then((value) => {
      // A null/undefined result usually means "couldn't get real data" (a
      // transient API hiccup, a parse failure, etc.), not a legitimate
      // answer worth remembering — caching it for the full TTL would make
      // one bad fetch look like an outage for however long that TTL is,
      // since every refresh attempt in the meantime would just get served
      // the same cached failure instead of actually retrying.
      if (value != null) {
        cache.set(key, { value, expiresAt: Date.now() + ttlMs });
      }
      return value;
    })
    .finally(() => {
      inFlight.delete(key);
    });
  inFlight.set(key, promise);
  return promise;
}
