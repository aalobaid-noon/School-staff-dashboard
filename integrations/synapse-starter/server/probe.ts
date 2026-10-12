// The cross-check primitive: run one throwaway SELECT, uncached, and hand back its rows.
//
// A baked read (server/queries/*.sql.ts) is the app's product surface — reviewable, cached,
// rendered. A PROBE is the opposite: a one-off question the agent asks to prove a baked read's
// number is right ("count it a second way and see if the two agree"). It is deliberately NOT a
// read — nothing registers it, nothing renders it, nothing caches it, and it is workspace-only.
// Without it, verifying a number means baking a temporary read, registering it, curling it, then
// remembering to delete it — a ritual an agent will skip. See the synapse-verify-numbers skill.
//
// Read-only by construction (see rejectReason): probes are how an agent checks Noon's warehouse,
// and the warehouse is read-only through Citadel. The guard here is defence in depth, stated
// locally so the contract this endpoint offers is legible without reading Citadel's source.

import { type AthenaQueryClient, runAthenaQuery } from './athena.js';

// Probes answer questions ("how many?", "which values?", "does the total reconcile?") — they are
// not a data-delivery path, so they are capped far below the read path's MAX_ROWS. A probe that
// wants more rows than this is asking the wrong question: aggregate it in SQL.
export const PROBE_MAX_ROWS = 1000;

export interface ProbeResult {
  sql: string;
  columns: string[];
  rows: Record<string, unknown>[];
  truncated: boolean;
  ranAt: string | null; // ISO time the probe hit the lake; null when it never ran
  configured: boolean; // false when secrets are missing (synapse client is null)
  error: string | null;
}

// Statements a probe may begin with. Trino's read forms are SELECT, WITH (CTE), SHOW, DESCRIBE
// and EXPLAIN — the last three matter because the SQL skill's discovery step uses them to confirm
// a table's real columns rather than guessing by analogy (skill/SKILL.md, Rule 3).
const ALLOWED_LEADING = /^(select|with|show|describe|desc|explain)\b/i;

// Belt-and-braces: even inside a CTE body, these have no business in a probe. The leading-keyword
// and single-statement checks already make a mutation hard to express; this makes it explicit.
const FORBIDDEN = /\b(insert|update|delete|drop|create|alter|truncate|grant|revoke|merge|call)\b/i;

// `SHOW CREATE TABLE` is the SQL skill's sanctioned way to confirm a noon2_core table's real
// columns instead of guessing by analogy (skill/SKILL.md, Rule 3) — and it contains the word
// CREATE. SHOW's grammar is read-only in full, so it is exempt from the keyword sweep above;
// the leading-keyword check still pins the statement to a SHOW.
const KEYWORD_SWEEP_EXEMPT = /^show\b/i;

// Strip SQL comments so the guard reads the statement the engine will actually run, without a
// `-- DELETE ...` comment tripping FORBIDDEN or a `/* ; */` faking a second statement. Single- and
// double-quoted literals are respected, so a legitimate `WHERE name = 'a--b'` survives intact.
// The result is used ONLY for guard decisions — the ORIGINAL sql is what gets executed.
export function stripSqlComments(sql: string): string {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (ch === "'" || ch === '"') {
      const quote = ch;
      out += ch;
      i += 1;
      while (i < sql.length) {
        out += sql[i];
        // Doubled quote ('' or "") is an escaped quote inside the literal, not its end.
        if (sql[i] === quote && sql[i + 1] === quote) {
          out += sql[i + 1];
          i += 2;
          continue;
        }
        if (sql[i] === quote) {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }

    if (ch === '-' && next === '-') {
      while (i < sql.length && sql[i] !== '\n') i += 1;
      continue;
    }

    if (ch === '/' && next === '*') {
      i += 2;
      while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }

    out += ch;
    i += 1;
  }
  return out;
}

// Why a probe is refused, or null when it may run. Returning the reason (rather than a bare
// boolean) matters: the agent reads it and fixes the SQL, so the message names the rule.
export function rejectReason(sql: string): string | null {
  const bare = stripSqlComments(sql).trim();
  const withoutTrailingSemicolon = bare.replace(/;\s*$/, '');

  if (!withoutTrailingSemicolon) return 'a probe needs a SQL statement';
  if (withoutTrailingSemicolon.includes(';')) {
    return 'a probe runs exactly one statement — remove the extra ";"';
  }
  if (!ALLOWED_LEADING.test(withoutTrailingSemicolon)) {
    return 'a probe must be read-only: start with SELECT, WITH, SHOW, DESCRIBE or EXPLAIN';
  }
  if (
    !KEYWORD_SWEEP_EXEMPT.test(withoutTrailingSemicolon) &&
    FORBIDDEN.test(withoutTrailingSemicolon)
  ) {
    return 'a probe must be read-only: it cannot contain INSERT/UPDATE/DELETE/DDL keywords';
  }
  return null;
}

// Run a probe. Mirrors runRead's resilience contract: a null client yields configured:false and a
// failed query yields an `error` field — neither path throws, so the route can't 500 on bad SQL.
export async function runProbe(
  client: AthenaQueryClient | null,
  sql: string,
): Promise<ProbeResult> {
  const base = { sql, columns: [] as string[], rows: [] as Record<string, unknown>[] };

  const refusal = rejectReason(sql);
  if (refusal) {
    return { ...base, truncated: false, ranAt: null, configured: client !== null, error: refusal };
  }

  if (!client) {
    return { ...base, truncated: false, ranAt: null, configured: false, error: null };
  }

  try {
    // 'probe: cross-check' is the read_context Citadel logs for these — they are distinguishable
    // from product reads in athena_read_log, so probe traffic never looks like app traffic.
    //
    // GOTCHA worth knowing when reading a probe's result: passing maxRows only tells Citadel's
    // guard what an explicit `LIMIT` may reach. A probe whose SQL carries NO top-level LIMIT gets
    // `LIMIT 20` appended silently (server/athena.ts). Aggregate probes return a handful of rows
    // so that ceiling is invisible; a probe that lists rows must carry its own LIMIT or it will
    // quietly answer with 20 and look like a complete result.
    const value = await runAthenaQuery(client, sql, PROBE_MAX_ROWS, 'probe: cross-check');
    // runAthenaQuery paginates to the read path's MAX_ROWS; clamp again here so a probe can never
    // haul a product-sized result through the diagnostic endpoint.
    const clamped = value.rows.slice(0, PROBE_MAX_ROWS);
    return {
      ...base,
      columns: value.columns,
      rows: clamped,
      truncated: value.truncated || clamped.length < value.rows.length,
      ranAt: new Date().toISOString(),
      configured: true,
      error: null,
    };
  } catch (err) {
    return {
      ...base,
      truncated: false,
      ranAt: null,
      configured: true,
      error: err instanceof Error ? err.message : 'probe failed',
    };
  }
}
