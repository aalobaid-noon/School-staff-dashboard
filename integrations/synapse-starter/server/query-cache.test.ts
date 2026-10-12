import { describe, expect, it } from 'vitest';
import { createQueryCache } from './query-cache.js';

describe('createQueryCache', () => {
  it('runs the fetcher on a miss and serves the cached value within TTL', async () => {
    let clock = 1_000;
    let calls = 0;
    const cache = createQueryCache<number>({ ttlMs: 1000, now: () => clock });
    const fetcher = async () => {
      calls += 1;
      return 42;
    };

    const first = await cache.get('k', fetcher);
    expect(first).toEqual({ value: 42, fetchedAt: 1000, cached: false });
    expect(calls).toBe(1);

    clock = 1500; // still within the 1000ms TTL
    const second = await cache.get('k', fetcher);
    expect(second).toEqual({ value: 42, fetchedAt: 1000, cached: true });
    expect(calls).toBe(1); // fetcher NOT called again
  });

  it('re-fetches once the entry is older than TTL', async () => {
    let clock = 0;
    let calls = 0;
    const cache = createQueryCache<number>({ ttlMs: 1000, now: () => clock });
    const fetcher = async () => {
      calls += 1;
      return calls;
    };

    await cache.get('k', fetcher); // fetchedAt=0, value=1
    clock = 1000; // exactly TTL → expired (strict <)
    const refreshed = await cache.get('k', fetcher);
    expect(refreshed).toEqual({ value: 2, fetchedAt: 1000, cached: false });
    expect(calls).toBe(2);
  });

  it('keys entries independently and does not store on fetcher error', async () => {
    const cache = createQueryCache<string>({ ttlMs: 1000, now: () => 0 });
    await cache.get('a', async () => 'A');
    await cache.get('b', async () => 'B');
    expect((await cache.get('a', async () => 'X')).value).toBe('A');
    expect((await cache.get('b', async () => 'X')).value).toBe('B');

    await expect(cache.get('c', async () => Promise.reject(new Error('boom')))).rejects.toThrow(
      'boom',
    );
    // nothing cached → next call runs the (now succeeding) fetcher
    expect((await cache.get('c', async () => 'C')).cached).toBe(false);
  });
});
