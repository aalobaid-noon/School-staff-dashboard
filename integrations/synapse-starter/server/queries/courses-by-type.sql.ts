// A baked, app-wide read.
//
// Convention: each server/queries/<name>.sql.ts exports a final SELECT plus the
// registry + skill versions it was written against. Baking the SQL into the repo keeps it
// reviewable in the PR diff and traceable to the schema it targets. There are no params —
// reads are app-wide (HMAC app auth via synapse.athenaQuery), not per-user.
//
// To add your own read: describe the data you want and let /skill write + bake the SELECT
// here (see AGENTS.md). Run it through synapse.athenaQuery — never a raw fetch.

export const name = 'courses-by-type';

export const title = 'Active courses by type';

export const description =
  'How many non-deleted courses exist of each type (O2O / Marketplace / School). A small, ' +
  'app-wide aggregate over the d_course dimension — a minimal, end-to-end example of the ' +
  'reads-v1 path: baked SELECT → athenaQuery → cache → rendered rows.';

// Target dialect: Trino/Presto (Amazon Athena).
// Table: noon2_datamart.d_course (registry key `d_course`) — a dimension table, so it is
// app-wide with no per-user scope. Business rule applied: exclude deleted courses
// (is_course_deleted = 0), per the skill's default assumptions. Naturally bounded to a
// handful of rows (one per course_type), so no LIMIT is needed.
//
// Writing a read that returns ROWS (not an aggregate)? Two rules, or Citadel bites:
//   1. Carry an explicit top-level `LIMIT n` in the SQL. Without one the guard silently
//      appends `LIMIT 20` — you get 20 rows and a "success".
//   2. `n` must be ≤ the platform hard cap (server/athena.ts MAX_ROWS = 100,000). The read
//      path passes that cap as `maxRows`; ask for more and Citadel rejects it with
//      `LIMIT cannot exceed N rows`. Set a smaller per-read ceiling via `export const maxRows`.
// Need more than 100,000 rows? No single read can do it — aggregate in SQL, or chunk the sync.
export const sql = `SELECT
  course_type,
  COUNT(*) AS course_count
FROM noon2_datamart.d_course
WHERE is_course_deleted = 0
GROUP BY course_type
ORDER BY course_count DESC`;

export const registryVersion = 'v2.21';

export const skillVersion = 'replit-v2.21.0';
