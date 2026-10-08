import type { SynapseClient } from '@noonacademy/synapse-sdk';

// A read result, normalised to the one shape the client renders: an ordered list of
// column names plus row objects keyed by those columns.
export interface AthenaRows {
  columns: string[];
  rows: Record<string, unknown>[];
  truncated: boolean; // true when the result was capped at MAX_ROWS (surfaced in the UI)
}

// Framework-level backstop: cap rows before they reach the in-memory cache and the browser, so
// an unexpectedly large baked query can't OOM the cache or freeze the page. The shipped example
// returns a handful of rows; this guards future reads. `truncated` is surfaced, never silent.
//
// This is also the `maxRows` we hand Citadel's SQL guard (see runAthenaQuery). It must stay in
// lockstep with Citadel's MAX_ROWS_HARD_CAP (src/http/athena-read-http.ts) — Citadel rejects any
// higher `maxRows` with `LIMIT cannot exceed N rows`, and clamps the rest. Reads that need the full
// cap must ALSO carry an explicit top-level `LIMIT 100000` in their SQL; without one, the guard
// silently appends `LIMIT 20`. For more than the cap, aggregate in SQL or chunk — not one read.
//
// TRADEOFF: at 100k, a read accumulates up to 100k rows in server memory (~100 sequential page
// round-trips) and ships them to the browser. Reserve reads this large for genuine need; prefer an
// aggregate. Lower a specific read's ceiling with `export const maxRows` on its query module.
export const MAX_ROWS = 100_000;

function capRows(rows: Record<string, unknown>[]): {
  rows: Record<string, unknown>[];
  truncated: boolean;
} {
  return rows.length > MAX_ROWS
    ? { rows: rows.slice(0, MAX_ROWS), truncated: true }
    : { rows, truncated: false };
}

// The slice of the SDK the read path depends on, declared locally so the exact contract
// reads rely on is documented here: app-wide, HMAC-signed `athenaQuery({ sql })` — never
// a raw fetch.
export interface AthenaQueryClient {
  // One page. Citadel returns at most ~1000 rows per call and, when more rows of the same
  // execution remain, a `nextToken` (+ the `executionId` it is scoped to) to fetch the next page.
  // `context` is the read's purpose label — the SDK sends it as the x-synapse-read-context
  // header and Citadel records it in athena_read_log (read_context), so every ledger row says
  // which baked read produced it.
  athenaQuery(opts: {
    sql: string;
    maxRows?: number;
    context?: string;
    nextToken?: string;
    executionId?: string;
  }): Promise<unknown>;
}

// Narrow the SDK client to just the read contract above.
export function asAthenaClient(client: SynapseClient | null): AthenaQueryClient | null {
  return client as unknown as AthenaQueryClient | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// First-seen column order across every row — stable, and independent of which row
// happens to be first when a value is null/absent.
function deriveColumns(rows: Record<string, unknown>[]): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      seen.add(key);
    }
  }
  return [...seen];
}

// `athenaQuery`'s payload shape isn't pinned by this template, so normalise defensively.
// Accept the canonical `{ columns, rows }`, a `{ rows }` object without columns, or a bare
// array of row objects; anything else collapses to an empty result rather than throwing.
// NOTE: an unrecognised payload is indistinguishable from a genuinely empty read here — both
// yield `{ columns: [], rows: [] }` and are cached as a successful empty result for the TTL.
export function normalizeAthenaResult(raw: unknown): AthenaRows {
  if (Array.isArray(raw)) {
    const { rows, truncated } = capRows(raw.filter(isRecord));
    return { columns: deriveColumns(rows), rows, truncated };
  }

  if (isRecord(raw) && Array.isArray(raw.rows)) {
    const { rows, truncated } = capRows(raw.rows.filter(isRecord));
    const columns =
      Array.isArray(raw.columns) && raw.columns.every((c) => typeof c === 'string')
        ? (raw.columns as string[])
        : deriveColumns(rows);
    return { columns, rows, truncated };
  }

  return { columns: [], rows: [], truncated: false };
}

// The continuation handle for the next page: a `nextToken` and the `executionId` it is scoped to.
// Both must be present to fetch more; either missing ends pagination. Read defensively for the
// same reason as the row payload — the page shape isn't pinned by this template.
function readPageMeta(raw: unknown): { nextToken?: string; executionId?: string } {
  if (!isRecord(raw)) return {};
  const nextToken =
    typeof raw.nextToken === 'string' && raw.nextToken.length > 0 ? raw.nextToken : undefined;
  const executionId =
    typeof raw.executionId === 'string' && raw.executionId.length > 0 ? raw.executionId : undefined;
  return { nextToken, executionId };
}

// Run one baked SELECT app-wide and hand back rendered rows, following `nextToken` across pages so
// a read isn't silently clipped to Citadel's ~1000-row first page. The SQL is built at authoring
// time (see server/queries/*.sql.ts), so there are no params to bind here.
//
// `maxRows` is the ceiling Citadel checks the SQL's explicit `LIMIT` against. It defaults to the
// platform hard cap (MAX_ROWS); the SDK's own default is a much lower 1000, which is what produces
// `LIMIT cannot exceed 1000 rows` for reads whose SQL asks for more without lifting it here. It is
// NOT the page size — Citadel pages at ~1000 rows regardless — so paginating below is what actually
// delivers more than one page's worth. MAX_ROWS also bounds the loop: we never accumulate past it,
// and if pages still remain when we stop, `truncated` is surfaced (never a silent clip).
export async function runAthenaQuery(
  client: AthenaQueryClient,
  sql: string,
  maxRows: number = MAX_ROWS,
  context?: string,
): Promise<AthenaRows> {
  const firstRaw = await client.athenaQuery({ sql, maxRows, context });
  const first = normalizeAthenaResult(firstRaw);
  let columns = first.columns;
  const rows = [...first.rows];
  let meta = readPageMeta(firstRaw);

  while (meta.nextToken && meta.executionId && rows.length < MAX_ROWS) {
    // Same context on every page — each page is its own ledger row in athena_read_log.
    const raw = await client.athenaQuery({
      sql,
      maxRows,
      context,
      nextToken: meta.nextToken,
      executionId: meta.executionId,
    });
    const page = normalizeAthenaResult(raw);
    // A short first page (e.g. all-null values in row 0) can yield no columns; adopt the first
    // non-empty set we see so the rendered result still has headers.
    if (columns.length === 0 && page.columns.length > 0) columns = page.columns;
    rows.push(...page.rows);
    meta = readPageMeta(raw);
  }

  const capped = capRows(rows);
  // Truncated if the MAX_ROWS backstop clipped the accumulator, or if we stopped with pages still
  // pending (hit the row bound, or a token we couldn't follow because its executionId was absent).
  const truncated = capped.truncated || Boolean(meta.nextToken);
  return { columns, rows: capped.rows, truncated };
}
