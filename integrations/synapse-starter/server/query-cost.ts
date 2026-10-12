// Catch the baked reads that will quietly cost money, at boot, before anyone deploys them.
//
// Athena bills by BYTES SCANNED. A read over a partitioned fact table without a `dt` filter scans
// the entire table — every cache miss, forever — and nothing about it looks wrong: it returns the
// right rows, the page renders, the tests pass. The builder never sees a bill, so the feedback
// loop that would normally correct this doesn't exist here.
//
// This is a check and not a skill on purpose. "Remember to filter on dt" already lives in
// skill/SKILL.md; the failure mode is forgetting, and prose does not catch forgetting. These
// warnings run over every registered read at startup (server/boot.ts) and appear on the console's
// Views tab, so a costly read is visible without anyone thinking to look for it.
//
// Warnings, never errors: this reads SQL with regexes, so it is necessarily approximate, and a
// false positive must not be able to block a deploy. It says "check this", not "this is wrong".

// Partitioned on BIGINT `dt` (YYYYMMDD). Kept in lockstep with skill/SKILL.md's
// "Partitioned tables — ALWAYS filter on dt" section, which is the source of truth.
export const PARTITIONED_TABLES = [
  'f_user_session',
  'f_user_playback',
  'f_student_activity',
  'f_classroom_events',
  'f_client_student_events',
  'f_user_reaction',
  'f_user_poll',
];

// Large tables that are NOT partitioned — no `dt` filter is possible, so `SELECT *` over them is
// the expensive shape to watch for instead.
const UNPARTITIONED_FACTS = [
  'f_user_survey',
  'f_course_session',
  'f_user_assessment',
  'f_transaction_details',
  'f_user_note',
];

export interface CostWarning {
  /** Stable code, so a future console tab can render these without parsing prose. */
  code: 'missing-dt-filter' | 'select-star-on-fact' | 'unbounded-row-read';
  message: string;
}

// Strip comments and collapse whitespace so the patterns below see the statement, not its layout.
// Deliberately simpler than server/probe.ts's scanner: a false positive here costs a log line,
// whereas there it decides whether SQL runs.
function normalize(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function referencesTable(sql: string, table: string): boolean {
  // Word-boundary match so `f_user_poll` doesn't also hit `f_user_poll_answers`.
  return new RegExp(`\\b${table}\\b`).test(sql);
}

// Is there a real `dt` predicate — not just the column appearing in a SELECT list or GROUP BY?
function hasDtPredicate(sql: string): boolean {
  return /\bdt\s*(>=|<=|<|>|=|between|in\s*\()/.test(sql);
}

// An aggregate collapses its input, so "no LIMIT" is expected and fine. A row-returning read
// without one is the shape that hauls an unbounded result set through the cache and the browser.
function isAggregate(sql: string): boolean {
  return (
    /\b(count|sum|avg|min|max|approx_distinct|array_agg)\s*\(/.test(sql) || /\bgroup by\b/.test(sql)
  );
}

export function costWarnings(sql: string): CostWarning[] {
  const normalized = normalize(sql);
  const warnings: CostWarning[] = [];

  const partitionedHits = PARTITIONED_TABLES.filter((t) => referencesTable(normalized, t));
  if (partitionedHits.length > 0 && !hasDtPredicate(normalized)) {
    warnings.push({
      code: 'missing-dt-filter',
      message:
        `reads ${partitionedHits.join(', ')} without a \`dt\` filter — this scans the whole ` +
        'table on every cache miss. Add e.g. `AND dt >= CAST(FORMAT_DATETIME(CURRENT_DATE - ' +
        "INTERVAL '30' DAY, 'yyyyMMdd') AS BIGINT)`.",
    });
  }

  const factHits = [...PARTITIONED_TABLES, ...UNPARTITIONED_FACTS].filter((t) =>
    referencesTable(normalized, t),
  );
  if (factHits.length > 0 && /select\s+\*/.test(normalized)) {
    warnings.push({
      code: 'select-star-on-fact',
      message:
        `\`SELECT *\` over ${factHits.join(', ')} — Athena is columnar, so naming only the ` +
        'columns you use is the single cheapest change available. Scanning cost is per column.',
    });
  }

  if (!isAggregate(normalized) && !/\blimit\s+\d+/.test(normalized)) {
    warnings.push({
      code: 'unbounded-row-read',
      message:
        'returns rows with no explicit `LIMIT`. Citadel silently appends `LIMIT 20`, so this ' +
        'read will look complete while showing 20 rows. Add the LIMIT you actually mean.',
    });
  }

  return warnings;
}

// Every registered read's warnings, keyed by name — empty when the app is clean.
export function costWarningsForReads(
  reads: { name: string; sql: string }[],
): Record<string, CostWarning[]> {
  const out: Record<string, CostWarning[]> = {};
  for (const read of reads) {
    const warnings = costWarnings(read.sql);
    if (warnings.length > 0) out[read.name] = warnings;
  }
  return out;
}

// One block of boot output, or null when there's nothing to say. Returned rather than logged so
// server/boot.ts stays the only place that decides what reaches the console.
export function formatCostWarnings(reads: { name: string; sql: string }[]): string | null {
  const byRead = costWarningsForReads(reads);
  const names = Object.keys(byRead);
  if (names.length === 0) return null;

  const lines = [`[synapse-starter] ${names.length} read(s) may scan more than they need:`];
  for (const name of names) {
    for (const warning of byRead[name] ?? []) {
      lines.push(`  • ${name}: ${warning.message}`);
    }
  }
  return lines.join('\n');
}
