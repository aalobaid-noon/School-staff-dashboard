import { readFileSync } from 'node:fs';

// Kit-update discovery for the console Home tab (workspace-only, like every /__synapse route):
// compares this clone's TEMPLATE_VERSION against the template repo's current one on GitHub.
// A newer template is a QUIET notice, never a red check — and every failure mode here (no
// network, GitHub down, malformed file) degrades to "no notice", never to an error the
// builder has to deal with.

export interface KitProjection {
  local: string | null;
  latest: string | null;
  updateAvailable: boolean;
}

// The template repo is public — no auth, raw file fetch.
export const TEMPLATE_VERSION_URL =
  'https://raw.githubusercontent.com/noonAcademy/synapse-starter/main/TEMPLATE_VERSION';

// Versions are YYYY.MM.DD with an optional .N suffix for a second bump in one day (see
// UPGRADES.md). Compared numerically part by part — string compare would sort .10 before .2.
export function parseVersion(text: string): number[] | null {
  const parts = text.trim().split('.');
  if (parts.length < 3 || parts.length > 4) return null;
  const nums = parts.map((p) => (/^\d+$/.test(p) ? Number(p) : Number.NaN));
  return nums.some(Number.isNaN) ? null : nums;
}

export function isNewer(candidate: string, current: string): boolean {
  const a = parseVersion(candidate);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

export function buildKit(input: { local: string | null; latest: string | null }): KitProjection {
  const local = input.local?.trim() || null;
  const latest = input.latest?.trim() || null;
  // No local version file = a pre-versioning clone: anything the template publishes is newer.
  // No (or unparseable) latest = we couldn't check: stay quiet.
  const updateAvailable =
    latest !== null &&
    parseVersion(latest) !== null &&
    (local === null || parseVersion(local) === null || isNewer(latest, local));
  return { local, latest, updateAvailable };
}

// Missing file -> null (a clone that predates TEMPLATE_VERSION is a normal state, not a crash).
export function readTemplateVersion(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

// Fail-silent fetch of the template's current version, cached for an hour so the Home tab
// doesn't hit GitHub on every load. Injectable fetch for tests.
const CACHE_TTL_MS = 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 3_000;

export function latestVersionFetcher(
  fetchImpl: typeof fetch = fetch,
  url: string = TEMPLATE_VERSION_URL,
): () => Promise<string | null> {
  let cached: { value: string | null; at: number } | null = null;
  return async () => {
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;
    let value: string | null = null;
    try {
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (res.ok) {
        const text = (await res.text()).trim();
        value = parseVersion(text) ? text : null;
      }
    } catch {
      value = null; // offline / GitHub down / timeout — the notice just doesn't show
    }
    cached = { value, at: Date.now() };
    return value;
  };
}
