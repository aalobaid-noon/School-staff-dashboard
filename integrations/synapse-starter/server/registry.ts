import { createHash } from 'node:crypto';
import { buildHeaders } from '@noonacademy/citadel-transport';

// Live-registry access for the workspace console (and the maintainer sync script). Citadel
// serves the registry as TS source TEXT at GET /api/registry (HMAC-signed, ETag'd, with a
// /meta sibling for cheap version checks — contract in INTEGRATE.md §6). We never EXECUTE that
// text: agents consume it as text (the freshest source when writing SQL), and the Get-data tab
// parses it into browse structures live (server/registryParse.ts — parse, never eval).
// Every failure mode falls back to the committed snapshot, labeled — the tab never breaks on this.

export interface RegistryCreds {
  baseUrl: string;
  appId: string;
  appSecret: string;
}

export type SnapshotReason = 'no-secrets' | 'not-deployed' | 'unreachable';

export interface RegistryStatus {
  source: 'live' | 'snapshot';
  /** Why we're on the snapshot; null when source is 'live'. */
  reason: SnapshotReason | null;
  /** From GET /api/registry/meta — null when unavailable (meta is best-effort). */
  liveVersion: string | null;
  liveLastModified: string | null;
  /** The "Last updated:" date in the snapshot's header comment; null if the header ever changes. */
  snapshotLastUpdated: string | null;
  /** The app-computed content stamp of the text this status describes — see registryStamp. */
  stamp: string;
}

// ---------------------------------------------------------------------------
// The registry stamp — an app-computed content identity for "which registry did
// this read get written against?"
// ---------------------------------------------------------------------------
//
// ⚠️ FROZEN FLEET CONTRACT. The normalization below is not an implementation detail:
// every baked read in every fleet clone carries a `registryVersion` stamp produced by
// this exact function, and the stale-read comparison works only while today's hashes
// remain comparable with every stamp already baked. Changing the normalization (or the
// hash, or the truncation) breaks comparability with the entire fleet's existing stamps
// and MUST be treated as a breaking format change — introduce a new, distinguishable
// stamp marker (e.g. a `v2:` prefix) rather than editing these rules, so old stamps
// parse as "can't determine" instead of falsely reading as stale.
//
// The contract:
//   1. Text is UTF-8; CRLF line endings normalize to LF ("\r\n" → "\n").
//   2. Trailing newlines are trimmed (a final "\n" must not change the identity).
//   3. Hash = SHA-256 of the normalized text, truncated to the first 12 lowercase hex chars.
//   4. Token = "<hash12>@<YYYY-MM-DD>" when a date is known, else "<hash12>".
//      The date is provenance, not identity: live text dates from the response's
//      Last-Modified (meta.lastModified as fallback); snapshot text from the snapshot's
//      "Last updated:" header line.
//
// Agents never compute this — they copy the stamp served by /__synapse/registry/status
// (skill/SKILL.md "Bake the read"). One implementation, zero drift.

export function registryStamp(text: string, date: string | null): string {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\n+$/, '');
  const hash = createHash('sha256').update(normalized, 'utf8').digest('hex').slice(0, 12);
  const isoDate = toIsoDate(date);
  return isoDate ? `${hash}@${isoDate}` : hash;
}

// Accepts an HTTP-date (live Last-Modified) or an ISO-ish date and yields YYYY-MM-DD; null
// when absent or unparseable — a stamp without a date still identifies content.
function toIsoDate(date: string | null): string | null {
  if (!date) return null;
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

const STAMP_TOKEN = /^([0-9a-f]{12})(?:@(\d{4}-\d{2}-\d{2}))?$/;

export function parseStampToken(token: string): { hash: string; date: string | null } | null {
  const m = token.match(STAMP_TOKEN);
  if (!m?.[1]) return null;
  return { hash: m[1], date: m[2] ?? null };
}

export type StampVerdict = 'ok' | 'stale' | 'unknown';

// The comparison rules (decided once, implemented here — see the contract comment above):
//   same hash                              → 'ok'      (read matches the registry being served)
//   different hash + strictly older date   → 'stale'   (the only verdict that ever warns)
//   different hash + newer-or-equal date   → 'ok'      (read is ahead of what's currently served,
//                                                       e.g. baked live while offline on snapshot)
//   unparseable/missing token or dates     → 'unknown' (pre-stamp formats like "v2.21" — silent,
//                                                       never a false warning)
export function compareStamp(bakedToken: string, currentToken: string): StampVerdict {
  const baked = parseStampToken(bakedToken);
  const current = parseStampToken(currentToken);
  if (!baked || !current) return 'unknown';
  if (baked.hash === current.hash) return 'ok';
  if (!baked.date || !current.date) return 'unknown';
  return baked.date < current.date ? 'stale' : 'ok';
}

export interface ReadFreshness {
  name: string;
  title: string;
  registryVersion: string;
  verdict: StampVerdict;
}

// Verdict per registered read against the currently served registry's stamp. Takes the reads
// structurally (name/title/registryVersion) so this file stays decoupled from server/queries.
export function readsFreshness(
  currentStamp: string,
  reads: Array<{ name: string; title: string; registryVersion: string }>,
): ReadFreshness[] {
  return reads.map((r) => ({
    name: r.name,
    title: r.title,
    registryVersion: r.registryVersion,
    verdict: compareStamp(r.registryVersion, currentStamp),
  }));
}

export interface RegistryResult {
  status: RegistryStatus;
  text: string;
}

const FETCH_TIMEOUT_MS = 3_000;

// The snapshot's provenance line (server/citadel-schema.ts header): "// Last updated: 2026-05-04".
export function snapshotLastUpdated(snapshotText: string): string | null {
  return snapshotText.match(/Last updated:\s*(\S+)/)?.[1] ?? null;
}

// One signed GET against Citadel. GET signs an empty body; the signed path must match the
// request path exactly (INTEGRATE.md §6).
async function signedGet(
  creds: RegistryCreds,
  path: string,
  fetchImpl: typeof fetch,
  extraHeaders: Record<string, string> = {},
): Promise<Response> {
  return fetchImpl(`${creds.baseUrl}${path}`, {
    headers: { ...buildHeaders(creds, path, ''), ...extraHeaders },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
}

// Fetch the live registry text or throw — the sync script's strict path. The console route
// never uses this directly; it goes through registryFetcher below, which falls back instead.
export async function fetchLiveRegistryText(
  creds: RegistryCreds,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const res = await signedGet(creds, '/api/registry', fetchImpl);
  if (res.status === 404) {
    throw new Error(
      'GET /api/registry returned 404 — the registry endpoint is not deployed on this Citadel yet.',
    );
  }
  if (!res.ok) {
    throw new Error(`GET /api/registry failed: ${res.status}`);
  }
  return res.text();
}

interface RegistryMeta {
  version: string | null;
  lastModified: string | null;
}

// Meta is a nicety (version + date for the freshness banner) — any failure just means nulls.
async function fetchMeta(creds: RegistryCreds, fetchImpl: typeof fetch): Promise<RegistryMeta> {
  try {
    const res = await signedGet(creds, '/api/registry/meta', fetchImpl);
    if (!res.ok) return { version: null, lastModified: null };
    const body = (await res.json()) as { version?: unknown; lastModified?: unknown };
    return {
      version: typeof body.version === 'string' ? body.version : null,
      lastModified: typeof body.lastModified === 'string' ? body.lastModified : null,
    };
  } catch {
    return { version: null, lastModified: null };
  }
}

// The console's registry source: live when Citadel answers (revalidated with If-None-Match on
// every call — a 304 costs Citadel nothing and keeps agents always-fresh), snapshot otherwise.
// `creds` is null when the app has no secrets; `snapshotText` is read lazily so the fallback
// file is only touched when needed.
export function registryFetcher(deps: {
  creds: RegistryCreds | null;
  snapshotText: () => string;
  fetchImpl?: typeof fetch;
}): () => Promise<RegistryResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  let cached: {
    etag: string | null;
    lastModified: string | null;
    text: string;
    meta: RegistryMeta;
  } | null = null;

  const snapshot = (reason: SnapshotReason): RegistryResult => {
    const text = deps.snapshotText();
    const dated = snapshotLastUpdated(text);
    return {
      status: {
        source: 'snapshot',
        reason,
        liveVersion: null,
        liveLastModified: null,
        snapshotLastUpdated: dated,
        stamp: registryStamp(text, dated),
      },
      text,
    };
  };

  return async () => {
    if (!deps.creds) return snapshot('no-secrets');
    const creds = deps.creds;

    let res: Response;
    try {
      res = await signedGet(
        creds,
        '/api/registry',
        fetchImpl,
        cached?.etag ? { 'if-none-match': cached.etag } : {},
      );
    } catch {
      return snapshot('unreachable'); // offline / timeout / DNS — never the tab's problem
    }

    if (res.status === 304 && cached) {
      // Unchanged since last fetch — cached text is live-fresh by definition.
    } else if (res.ok) {
      const text = await res.text();
      const meta = await fetchMeta(creds, fetchImpl);
      cached = {
        etag: res.headers.get('etag'),
        lastModified: res.headers.get('last-modified'),
        text,
        meta,
      };
    } else if (res.status === 404) {
      return snapshot('not-deployed'); // endpoint not on this Citadel yet (INTEGRATE.md §6 grounding note)
    } else {
      return snapshot('unreachable'); // 503 registry-temporarily-unavailable, 5xx, auth errors
    }

    if (!cached) return snapshot('unreachable'); // 304 with no prior cache — shouldn't happen
    // The stamp's date prefers the response's own Last-Modified; /meta's lastModified is the
    // best-effort fallback (both may be absent — the stamp still identifies content without one).
    const liveDate = cached.lastModified ?? cached.meta.lastModified;
    return {
      status: {
        source: 'live',
        reason: null,
        liveVersion: cached.meta.version,
        // Normalized for display; HTTP-dates (from the header) become YYYY-MM-DD.
        liveLastModified: toIsoDate(liveDate) ?? liveDate,
        snapshotLastUpdated: null,
        stamp: registryStamp(cached.text, liveDate),
      },
      text: cached.text,
    };
  };
}
