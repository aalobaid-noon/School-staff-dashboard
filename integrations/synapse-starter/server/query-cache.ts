// In-memory, per-query-name cache for baked reads. The lake refreshes roughly every
// 12h, so a TTL well under that (default 1h) keeps the app responsive and cheap while
// staying fresh enough that what a builder sees is never more than an hour behind a
// refresh. This is process-local and resets on restart.

const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour

interface CacheEntry<T> {
  value: T;
  fetchedAt: number; // epoch ms — also the "data as of" timestamp shown in the UI
}

export interface CacheResult<T> {
  value: T;
  fetchedAt: number;
  cached: boolean; // true => served from a live entry, false => just fetched
}

export interface QueryCache<T> {
  // Return the cached value if it's still within TTL; otherwise run `fetcher`, store the
  // result, and return it. A throwing `fetcher` is propagated and nothing is stored, so a
  // transient failure never poisons the cache.
  get(key: string, fetcher: () => Promise<T>): Promise<CacheResult<T>>;
  clear(): void;
}

export function createQueryCache<T>(
  opts: { ttlMs?: number; now?: () => number } = {},
): QueryCache<T> {
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
  const now = opts.now ?? Date.now;
  const store = new Map<string, CacheEntry<T>>();

  return {
    async get(key, fetcher) {
      const existing = store.get(key);
      if (existing && now() - existing.fetchedAt < ttlMs) {
        return { value: existing.value, fetchedAt: existing.fetchedAt, cached: true };
      }
      const value = await fetcher();
      const fetchedAt = now();
      store.set(key, { value, fetchedAt });
      return { value, fetchedAt, cached: false };
    },
    clear() {
      store.clear();
    },
  };
}
