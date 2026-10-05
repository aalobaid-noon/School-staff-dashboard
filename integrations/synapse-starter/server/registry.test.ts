import { describe, expect, it, vi } from 'vitest';
import {
  compareStamp,
  fetchLiveRegistryText,
  parseStampToken,
  readsFreshness,
  registryFetcher,
  registryStamp,
  snapshotLastUpdated,
} from './registry.js';

const CREDS = { baseUrl: 'https://citadel.test', appId: 'app_x', appSecret: 'rpl_test_secret' };
const SNAPSHOT = '// Last updated: 2026-05-04\nexport const ATHENA_REGISTRY = {};\n';
const LIVE_TEXT = '// Last updated: 2026-07-20\nexport const ATHENA_REGISTRY = { fresh: true };\n';

type Reply = { status: number; text?: string; json?: unknown; etag?: string };

// A tiny signed-endpoint double: replies by path, records every request's headers.
function fakeFetch(replies: Record<string, Reply | (() => Reply)>) {
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  const impl = vi.fn(async (url: string, init?: { headers?: Record<string, string> }) => {
    calls.push({ url, headers: init?.headers ?? {} });
    const path = new URL(url).pathname;
    const spec = replies[path];
    const r = typeof spec === 'function' ? spec() : spec;
    if (!r) throw new Error(`unexpected fetch: ${url}`);
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      headers: { get: (h: string) => (h.toLowerCase() === 'etag' ? (r.etag ?? null) : null) },
      text: async () => r.text ?? '',
      json: async () => r.json ?? {},
    };
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

function fetcherWith(replies: Record<string, Reply | (() => Reply)>, creds = CREDS) {
  const { impl, calls } = fakeFetch(replies);
  const get = registryFetcher({ creds, snapshotText: () => SNAPSHOT, fetchImpl: impl });
  return { get, calls };
}

describe('registryFetcher', () => {
  it('serves the live text with meta, and signs the request', async () => {
    const { get, calls } = fetcherWith({
      '/api/registry': { status: 200, text: LIVE_TEXT, etag: '"v9"' },
      '/api/registry/meta': { status: 200, json: { version: 'v2.30', lastModified: '2026-07-20' } },
    });
    const result = await get();

    expect(result.text).toBe(LIVE_TEXT);
    expect(result.status).toEqual({
      source: 'live',
      reason: null,
      liveVersion: 'v2.30',
      liveLastModified: '2026-07-20',
      snapshotLastUpdated: null,
      stamp: registryStamp(LIVE_TEXT, '2026-07-20'),
    });
    // HMAC headers on the wire (INTEGRATE.md §6): app id + t=,v1= signature.
    expect(calls[0]?.headers['x-replit-app-id']).toBe('app_x');
    expect(calls[0]?.headers['x-citadel-signature']).toMatch(/t=\d+/);
  });

  it('revalidates with If-None-Match and serves the cache on 304 — still live', async () => {
    let first = true;
    const { get, calls } = fetcherWith({
      '/api/registry': (): Reply => {
        if (first) {
          first = false;
          return { status: 200, text: LIVE_TEXT, etag: '"v9"' };
        }
        return { status: 304 };
      },
      '/api/registry/meta': { status: 200, json: { version: 'v2.30', lastModified: '2026-07-20' } },
    });
    await get();
    const second = await get();

    const registryCalls = calls.filter((c) => c.url.endsWith('/api/registry'));
    expect(registryCalls[1]?.headers['if-none-match']).toBe('"v9"');
    expect(second.status.source).toBe('live');
    expect(second.text).toBe(LIVE_TEXT);
    // meta was cached from the 200 — a 304 must not refetch it
    expect(calls.filter((c) => c.url.endsWith('/meta'))).toHaveLength(1);
  });

  it('404 (endpoint not deployed) falls back to the snapshot, labeled not-deployed', async () => {
    const { get } = fetcherWith({ '/api/registry': { status: 404 } });
    const result = await get();
    expect(result.text).toBe(SNAPSHOT);
    expect(result.status.source).toBe('snapshot');
    expect(result.status.reason).toBe('not-deployed');
    expect(result.status.snapshotLastUpdated).toBe('2026-05-04');
    // The snapshot's stamp is dated by its own "Last updated:" header line.
    expect(result.status.stamp).toBe(registryStamp(SNAPSHOT, '2026-05-04'));
  });

  it('503 and network failure fall back to the snapshot, labeled unreachable', async () => {
    for (const replies of [
      { '/api/registry': { status: 503 } },
      {
        '/api/registry': () => {
          throw new Error('offline');
        },
      },
    ]) {
      const { get } = fetcherWith(replies as Record<string, Reply | (() => Reply)>);
      const result = await get();
      expect(result.status).toMatchObject({ source: 'snapshot', reason: 'unreachable' });
      expect(result.text).toBe(SNAPSHOT);
    }
  });

  it('missing secrets never touches the network', async () => {
    const { impl, calls } = fakeFetch({});
    const get = registryFetcher({ creds: null, snapshotText: () => SNAPSHOT, fetchImpl: impl });
    const result = await get();
    expect(result.status).toMatchObject({ source: 'snapshot', reason: 'no-secrets' });
    expect(calls).toHaveLength(0);
  });

  it('meta failure degrades to nulls without losing the live text', async () => {
    const { get } = fetcherWith({
      '/api/registry': { status: 200, text: LIVE_TEXT, etag: null as unknown as string },
      '/api/registry/meta': { status: 503 },
    });
    const result = await get();
    expect(result.status.source).toBe('live');
    expect(result.status.liveVersion).toBeNull();
    expect(result.text).toBe(LIVE_TEXT);
  });
});

describe('fetchLiveRegistryText (the sync script path — strict, no fallback)', () => {
  it('returns the text on 200', async () => {
    const { impl } = fakeFetch({ '/api/registry': { status: 200, text: LIVE_TEXT } });
    expect(await fetchLiveRegistryText(CREDS, impl)).toBe(LIVE_TEXT);
  });

  it('names the not-deployed case on 404, and throws on other failures', async () => {
    const notDeployed = fakeFetch({ '/api/registry': { status: 404 } });
    await expect(fetchLiveRegistryText(CREDS, notDeployed.impl)).rejects.toThrow(/not deployed/);
    const down = fakeFetch({ '/api/registry': { status: 503 } });
    await expect(fetchLiveRegistryText(CREDS, down.impl)).rejects.toThrow(/503/);
  });
});

describe('snapshotLastUpdated', () => {
  it('reads the header date and tolerates its absence', () => {
    expect(snapshotLastUpdated(SNAPSHOT)).toBe('2026-05-04');
    expect(snapshotLastUpdated('export const X = 1;')).toBeNull();
  });
});

describe('registryStamp (frozen fleet contract — see the comment on the helper)', () => {
  it('CRLF and trailing newlines never change the identity; content always does', () => {
    const base = registryStamp('a\nb', null);
    expect(registryStamp('a\r\nb', null)).toBe(base);
    expect(registryStamp('a\nb\n', null)).toBe(base);
    expect(registryStamp('a\nb\n\n\n', null)).toBe(base);
    expect(registryStamp('a\nc', null)).not.toBe(base);
  });

  it('is 12 lowercase hex chars, with the date appended when known', () => {
    expect(registryStamp('x', null)).toMatch(/^[0-9a-f]{12}$/);
    expect(registryStamp('x', '2026-07-20')).toMatch(/^[0-9a-f]{12}@2026-07-20$/);
  });

  it('normalizes HTTP-dates (live Last-Modified) to YYYY-MM-DD and drops unparseable ones', () => {
    expect(registryStamp('x', 'Wed, 22 Jul 2026 10:15:00 GMT')).toMatch(/@2026-07-22$/);
    expect(registryStamp('x', 'not a date')).toMatch(/^[0-9a-f]{12}$/);
  });
});

describe('parseStampToken / compareStamp (the detector rules)', () => {
  const current = registryStamp('registry v2', '2026-08-01');
  const OLD = registryStamp('registry v1', '2026-07-01');

  it('parses stamp tokens and rejects pre-stamp formats', () => {
    expect(parseStampToken(current)).toEqual({
      hash: current.slice(0, 12),
      date: '2026-08-01',
    });
    expect(parseStampToken('v2.21')).toBeNull();
    expect(parseStampToken('')).toBeNull();
  });

  it('same hash → ok, even with different dates', () => {
    const sameContentOtherDay = registryStamp('registry v2', '2026-07-15');
    expect(compareStamp(sameContentOtherDay, current)).toBe('ok');
  });

  it('different hash + strictly older date → stale (the only warning verdict)', () => {
    expect(compareStamp(OLD, current)).toBe('stale');
  });

  it('different hash + newer-or-equal date → ok (never warn about being ahead)', () => {
    expect(compareStamp(registryStamp('registry v3', '2026-08-09'), current)).toBe('ok');
    expect(compareStamp(registryStamp('registry v3', '2026-08-01'), current)).toBe('ok');
  });

  it('pre-stamp formats and missing dates → unknown, silently', () => {
    expect(compareStamp('v2.21', current)).toBe('unknown');
    expect(compareStamp(registryStamp('registry v1', null), current)).toBe('unknown');
    expect(compareStamp(OLD, registryStamp('registry v2', null))).toBe('unknown');
  });
});

describe('readsFreshness', () => {
  it('verdicts every registered read against the served stamp', () => {
    const current = registryStamp('registry v2', '2026-08-01');
    const reads = [
      {
        name: 'old-read',
        title: 'Old',
        registryVersion: registryStamp('registry v1', '2026-07-01'),
      },
      { name: 'fresh-read', title: 'Fresh', registryVersion: current },
      { name: 'legacy-read', title: 'Legacy', registryVersion: 'v2.21' },
    ];
    expect(readsFreshness(current, reads).map((r) => r.verdict)).toEqual([
      'stale',
      'ok',
      'unknown',
    ]);
  });
});
