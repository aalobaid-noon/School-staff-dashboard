// What the app's words MEAN — the definitions behind the numbers.
//
// The problem this solves is specific and arrives around the third page. A read called
// `active-students` counts students with a session in the last 7 days. Two weeks later another
// read, written in another session, counts students with any activity in the last 30 days and is
// also called "active students". Both are defensible. Both are now on screen. The builder trusts
// a dashboard that disagrees with itself, and nobody can say which one is wrong, because neither
// definition was ever written down anywhere a machine could check.
//
// This is the smallest thing that fixes it: definitions get NAMES, reads DECLARE which ones they
// use, and the definition travels with the number all the way to the page. It is the same idea a
// semantic layer implements at scale — grounding an answer in an agreed definition rather than
// re-deriving it per query — which is the single largest accuracy lever measured for
// natural-language-to-SQL pipelines like this one.
//
// SPEC.md's "Data: where every displayed number comes from" table is the human half of this;
// these are the machine-checkable half. Keep them in agreement.

export interface Metric {
  /** Stable id a read references. kebab-case: 'active-student'. */
  name: string;
  /** How it's said on screen: 'Active student'. */
  label: string;
  /**
   * Plain language, for someone who doesn't read SQL. Say what COUNTS and what is EXCLUDED —
   * the exclusions are where two well-meaning definitions diverge.
   */
  definition: string;
  /**
   * The canonical SQL every read using this metric should reuse verbatim — a predicate, an
   * expression, or a window. Copying this is the point: the string is the agreement.
   */
  sql?: string;
  /** Who decided. A name, so a disagreement has someone to take it to. */
  decidedBy?: string;
  /** ISO date the definition was last confirmed against the data (synapse-verify-numbers). */
  verifiedOn?: string;
}

// The app's metric definitions. A fresh clone has none — an app that shows two numbers doesn't
// need this, and ceremony nobody needs gets ignored. Add one the moment the SAME word appears in
// two reads, or the moment a builder asks "what counts as active?".
//
//   export const METRICS: Metric[] = [
//     {
//       name: 'active-student',
//       label: 'Active student',
//       definition:
//         'A student who attended at least one live session in the last 7 days. Excludes ' +
//         'deleted accounts and Nooners. Counts a person once however many sessions they ' +
//         'attended.',
//       sql: "user_type = 'STUDENT' AND is_deleted = 0 AND dt >= CAST(FORMAT_DATETIME(CURRENT_DATE - INTERVAL '7' DAY, 'yyyyMMdd') AS BIGINT)",
//       decidedBy: 'Lina, ops',
//       verifiedOn: '2026-08-02',
//     },
//   ];
export const METRICS: Metric[] = [];

const byName = (): Map<string, Metric> => new Map(METRICS.map((m) => [m.name, m]));

export function getMetric(name: string): Metric | null {
  return byName().get(name) ?? null;
}

export function listMetrics(): Metric[] {
  return [...METRICS];
}

// Resolve a read's declared metric names to definitions, dropping unknowns. Unknowns are reported
// separately by validateMetricRefs rather than thrown here — a typo in a metric name must not stop
// a page from rendering its data.
export function metricsFor(names: readonly string[] | undefined): Metric[] {
  if (!names || names.length === 0) return [];
  const map = byName();
  return names.map((n) => map.get(n)).filter((m): m is Metric => m !== undefined);
}

export interface MetricRefProblem {
  read: string;
  unknownMetric: string;
}

// Every read whose declared metrics don't exist. Surfaced at boot: a read referencing
// 'active-students' when the metric is 'active-student' would otherwise silently show a number
// with no definition attached, which is exactly the state this file exists to prevent.
export function validateMetricRefs(
  reads: { name: string; metrics?: readonly string[] }[],
): MetricRefProblem[] {
  const map = byName();
  const problems: MetricRefProblem[] = [];
  for (const read of reads) {
    for (const metric of read.metrics ?? []) {
      if (!map.has(metric)) problems.push({ read: read.name, unknownMetric: metric });
    }
  }
  return problems;
}

// One block of boot output, or null when everything resolves.
export function formatMetricProblems(
  reads: { name: string; metrics?: readonly string[] }[],
): string | null {
  const problems = validateMetricRefs(reads);
  if (problems.length === 0) return null;
  const known = METRICS.map((m) => m.name).join(', ') || '(none defined)';
  return [
    `[synapse-starter] ${problems.length} read(s) reference a metric that doesn't exist:`,
    ...problems.map((p) => `  • ${p.read} → "${p.unknownMetric}"`),
    `  known metrics: ${known}`,
  ].join('\n');
}
