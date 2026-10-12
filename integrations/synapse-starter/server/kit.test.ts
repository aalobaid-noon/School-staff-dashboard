import { describe, expect, it, vi } from 'vitest';
import { buildKit, isNewer, latestVersionFetcher, parseVersion } from './kit.js';

describe('parseVersion', () => {
  it('parses date versions with and without the same-day suffix', () => {
    expect(parseVersion('2026.07.16')).toEqual([2026, 7, 16]);
    expect(parseVersion('2026.07.16.2')).toEqual([2026, 7, 16, 2]);
    expect(parseVersion(' 2026.07.16\n')).toEqual([2026, 7, 16]);
  });

  it('rejects anything that is not 3-4 numeric parts', () => {
    expect(parseVersion('')).toBeNull();
    expect(parseVersion('v7')).toBeNull();
    expect(parseVersion('2026.07')).toBeNull();
    expect(parseVersion('2026.07.16.2.1')).toBeNull();
    expect(parseVersion('2026.07.aa')).toBeNull();
  });
});

describe('isNewer', () => {
  it('compares numerically part by part, not as strings', () => {
    expect(isNewer('2026.07.22', '2026.07.16')).toBe(true);
    expect(isNewer('2026.07.16', '2026.07.22')).toBe(false);
    expect(isNewer('2026.07.16', '2026.07.16')).toBe(false);
    // the .10 vs .2 trap: string compare gets this backwards
    expect(isNewer('2026.07.16.10', '2026.07.16.2')).toBe(true);
    // a suffixed bump is newer than the bare same-day version (missing part = 0)
    expect(isNewer('2026.07.16.2', '2026.07.16')).toBe(true);
  });
});

describe('buildKit', () => {
  it('flags an update when the template is ahead', () => {
    expect(buildKit({ local: '2026.07.16', latest: '2026.07.22' })).toEqual({
      local: '2026.07.16',
      latest: '2026.07.22',
      updateAvailable: true,
    });
  });

  it('stays quiet when up to date or ahead of the template', () => {
    expect(buildKit({ local: '2026.07.22', latest: '2026.07.22' }).updateAvailable).toBe(false);
    expect(buildKit({ local: '2026.07.23', latest: '2026.07.22' }).updateAvailable).toBe(false);
  });

  it('treats a missing local version as a pre-versioning clone (update available)', () => {
    expect(buildKit({ local: null, latest: '2026.07.22' }).updateAvailable).toBe(true);
  });

  it('never flags when the latest version is unknown or malformed — fail silent', () => {
    expect(buildKit({ local: null, latest: null }).updateAvailable).toBe(false);
    expect(buildKit({ local: '2026.07.16', latest: null }).updateAvailable).toBe(false);
    expect(buildKit({ local: '2026.07.16', latest: '<html>rate limited</html>' })).toEqual({
      local: '2026.07.16',
      latest: '<html>rate limited</html>',
      updateAvailable: false,
    });
  });
});

describe('latestVersionFetcher', () => {
  it('returns the trimmed version and caches it', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, text: async () => '2026.07.22\n' }));
    const latest = latestVersionFetcher(fetchImpl as unknown as typeof fetch, 'https://x/');
    expect(await latest()).toBe('2026.07.22');
    expect(await latest()).toBe('2026.07.22');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('returns null on network failure, non-OK, or a non-version body', async () => {
    for (const impl of [
      async () => {
        throw new Error('offline');
      },
      async () => ({ ok: false, text: async () => '' }),
      async () => ({ ok: true, text: async () => 'Not Found' }),
    ]) {
      const latest = latestVersionFetcher(impl as unknown as typeof fetch, 'https://x/');
      expect(await latest()).toBeNull();
    }
  });
});
