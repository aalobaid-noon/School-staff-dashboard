# MIGRATE-SYNC.md — Move an Athena→Postgres sync off raw AWS creds onto Citadel

This guide is for an **AI coding agent** migrating the **transport** of an existing "Athena → Postgres sync" app (the old internal guide's pattern) onto Citadel's sanctioned read path. You should already have a **Migration Report** from Job 0 of [`INTEGRATE.md`](./INTEGRATE.md) telling you which views the app reads, their filter shapes, and their per-run row counts. If you don't, run Job 0 first.

This file is self-contained: everything you need is inlined below. For this **existing-app** path you need exactly three secrets from the operator (`SYNAPSE_APP_ID`, `SYNAPSE_APP_SECRET`, `SYNAPSE_BASE_URL`); they may already be set if Job 1 of `INTEGRATE.md` was done. The install needs no credential — you vendor the `@noonacademy/*` tarballs exactly as the `synapse-starter` template does (Gate 4 of [`INTEGRATE.md`](./INTEGRATE.md)). Never print a secret value.

## The prime directive

**The sync architecture is good. Keep it.** Typed mappers (`getValue` + `parse*` helpers), batched `INSERT … ON CONFLICT DO UPDATE`, the scheduler, the `sync_logs` slot lock, and the app reading only its local Postgres at request time — all of that stays exactly as it is. The only thing that goes is the **transport**: raw shared AWS credentials driving `@aws-sdk/client-athena` directly. In its place: `POST /api/athena/run` on Citadel — per-app HMAC creds, SELECT-only guarded, every read logged server-side (`athena_read_log`: app id, tables touched, bytes scanned, latency) — wrapped by `@noonacademy/synapse-sdk`.

All work **on a branch**. Every change is additive and reversible. The app must keep booting — and keep syncing — at every step. The old AWS secrets are deleted only **after** the new transport is verified (see Verification).

---

## 1. The swap — one file

The old guide's canonical layout puts all Athena transport in **`server/athena.ts`**, which exports **`runQuery(sql)`**; `server/athena-sync.ts` (query builders, per-table sync fns, `syncAllFromAthena()`) only ever calls `runQuery`. So the swap is: **reimplement `runQuery` over the SDK, preserving its signature and return shape, and touch nothing else.** If this app's layout differs (Job 0 said `hand-rolled Athena`), find its equivalent narrowest seam and do the same there.

### 1.1 Install the SDK (runtime deps only)

Copy the three `@noonacademy/*` tarballs from the `synapse-starter` repo's `vendor/` into this app's `vendor/`, then add each one to **both** `dependencies` and `overrides` with identical `file:` specs (pnpm: `pnpm.overrides`). Full recipe and rationale: **Gate 4** of [`INTEGRATE.md`](./INTEGRATE.md). Requires Node ≥ 20.

No `.npmrc`, no registry, no `GITHUB_TOKEN` — `env -u GITHUB_TOKEN npm install` must succeed, and `grep npm.pkg.github.com package-lock.json` must print nothing. Install **runtime deps only** — Replit's package firewall blocks CVE-flagged dev dependencies.

### 1.2 The new `server/athena.ts`

```ts
// server/athena.ts — same exports, new transport (Citadel via the Synapse SDK).
// server/athena-sync.ts is untouched: it still calls runQuery(sql).
import { createSynapseClient, type SynapseClient } from '@noonacademy/synapse-sdk';

const appId = process.env.SYNAPSE_APP_ID;
const appSecret = process.env.SYNAPSE_APP_SECRET;
const baseUrl = process.env.SYNAPSE_BASE_URL;

const synapse: SynapseClient | null =
  appId && appSecret && baseUrl
    ? createSynapseClient({
        baseUrl,
        appId,
        appSecret,
        // Citadel's server-side query budget is ~30s, but the SDK's own request
        // timeout DEFAULTS TO 10s — without this, any query slower than 10s
        // aborts client-side while the server would still have finished it.
        requestTimeoutMs: 35_000,
      })
    : null;

export function isAthenaConfigured(): boolean {
  return synapse !== null;
}

// Citadel's hard cap per query. Do NOT ask for this to be raised — chunk instead (§2.2).
const MAX_ROWS = 10_000;

export interface QueryResult {
  columns: string[];
  rows: Record<string, string | null>[];
}

export async function runQuery(sql: string): Promise<QueryResult> {
  if (!synapse) {
    throw new Error(
      'Athena is not configured: set SYNAPSE_APP_ID, SYNAPSE_APP_SECRET, SYNAPSE_BASE_URL',
    );
  }
  // Citadel's guard appends `LIMIT 20` to any query WITHOUT a top-level LIMIT —
  // even when maxRows is passed (§2.1). Wrapping gives every query an explicit
  // top-level LIMIT without editing the builders in athena-sync.ts.
  const bounded = `SELECT * FROM (${sql.replace(/;[\s;]*$/, '')}) LIMIT ${MAX_ROWS}`;

  const rows: Record<string, string | null>[] = [];
  for await (const row of synapse.athenaQueryAll({ sql: bounded, maxRows: MAX_ROWS })) {
    rows.push(row);
  }
  if (rows.length === MAX_ROWS) {
    // Exactly at the cap = presume silent truncation: this query must be chunked (§2.2).
    console.warn(`[athena] runQuery returned exactly ${MAX_ROWS} rows — presume truncated`);
  }
  return { columns: rows.length > 0 ? Object.keys(rows[0]) : [], rows };
}
```

Notes on why this shape:

- **Rows are already name-keyed objects with string (or null) values, header row stripped** — Citadel does that server-side. So the existing `getValue(row, [aliases])` + `parse*` mappers in `athena-sync.ts` keep working **unchanged. Keep them** — Athena column casing still varies, so the alias lookups still earn their keep.
- `athenaQueryAll` transparently follows `nextToken`/`executionId` pagination across pages; you never touch tokens.
- `columns` is derived from the first row's keys (the server builds each row object in column order). If your app's old `runQuery` returned a different shape (e.g. rows only), preserve **that** shape instead — the contract is "`athena-sync.ts` needs zero edits", not this exact snippet.
- The `SELECT * FROM (…) LIMIT n` wrapper is valid Trino/Athena (derived tables need no alias there). A top-level `ORDER BY` inside the wrapped query is no longer guaranteed to survive — irrelevant for syncs, whose upserts are order-independent.
- Adapt the config error message / logging style to what the file had before.

### 1.3 Remove the AWS client

- Delete the `@aws-sdk/client-athena` import, the AWS client construction, the start/poll/get-results machinery, and `npm uninstall @aws-sdk/client-athena`.
- Keep `isAthenaConfigured()` (the scheduler checks it) but key it on the **Synapse** secrets, as above.
- Grep for stragglers: `grep -rn "aws-sdk\|AWS_ACCESS\|ATHENA_OUTPUT\|StartQueryExecution" server/ shared/` must come back empty (except maybe comments you then delete).

---

## 2. ⚠️ FOOTGUNS — read before running anything

### 2.1 The silent LIMIT-20 truncation

Citadel's SQL guard enforces the row cap in two independent ways, and **misreading either one silently syncs 20 rows and reports success**:

1. **A query with no top-level `LIMIT` gets `LIMIT 20` appended — even if you pass `maxRows`.** The guard's appended default is `min(20, maxRows)`, so `maxRows: 100000` does **not** lift it. The SQL itself must carry an explicit top-level `LIMIT` (the §1.2 wrapper's job).
2. **`maxRows` is the ceiling your explicit `LIMIT` is checked against**, and it defaults to 1000. `… LIMIT 100000` without `maxRows: 100000` is rejected with `LIMIT cannot exceed 1000 rows.`

So every sync read needs **both**: an explicit `LIMIT 100000` in the SQL **and** `maxRows: 100000` in the call. The §1.2 `runQuery` does both — if you write your own, do both.

### 2.2 The 100,000-row hard cap per query → chunk your backfills

`maxRows` is capped server-side at **100,000 rows per query**, full stop (raised from 10,000 — Citadel `MAX_ROWS_HARD_CAP`). Note that Citadel still pages at ~1000 rows, so a 100k read is ~100 sequential page round-trips; prefer aggregates. Incremental syncs (last-24h watermark filters) almost always fit. **Backfills (semester/full-history branches) can still exceed it** — and per §2.1 the overflow is a *silent truncation*, not an error.

Recipe: **chunk the backfill branch of each query builder by date window**, one guarded query per window, e.g. week-by-week from `BACKFILL_START`:

```ts
// athena-sync.ts backfill branch — same builder, windowed
for (let from = BACKFILL_START; from < now; from = addDays(from, 7)) {
  const to = minDate(addDays(from, 7), now);
  const { rows } = await runQuery(buildUsersQuery({ from, to }));
  await upsertUsers(rows); // ON CONFLICT DO UPDATE is idempotent → a crashed backfill just re-runs
}
```

The upserts are idempotent, so chunked backfills are **resumable**: rerunning a window is harmless. If a week still hits the cap (or the truncation warning fires), halve the window. **Do NOT request a platform cap change** — the cap is the contract.

### 2.3 ~30 seconds of server-side query time (and 10s of client-side by default)

The old direct-AWS path polled for up to ~120s. Citadel cancels a query after **~30s** server-side — and the SDK aborts after **10s** client-side unless you raise `requestTimeoutMs` at client creation (§1.2 does). A chunked/incremental query fits comfortably; if one times out, **narrow its window and retry** — don't loop retries of the same too-wide query.

### 2.4 The guard is single-statement, SELECT-only

One statement per call (`;`-separated batches are rejected), and it must be `SELECT` / `WITH … SELECT`. The builders' existing Athena/Trino SQL — `date_add`, `date_format`, casts, etc. — is unchanged and fine. Guard rejections come back as a `SynapseError` carrying the server's verbatim message (e.g. `Only SELECT (or WITH … SELECT) queries are allowed.`); they are permanent, not retryable.

---

## 3. Secrets swap

1. **Add** (may already exist from Job 1): `SYNAPSE_APP_ID`, `SYNAPSE_APP_SECRET`, `SYNAPSE_BASE_URL` (runtime, server-only). Replit Secrets, never committed files, never printed. No install-time credential is needed — see §1.1.
2. **Only after Verification passes**: **delete `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and every `ATHENA_*` secret** from Replit Secrets. That deletion is the point of this whole migration — an app that keeps both transports' creds has migrated nothing.

---

## 4. Verification — in order, all observed, none assumed

1. **Sync runs green.** `npm run sync:athena` (or this app's equivalent) → a new `sync_logs` **success** row.
2. **Row counts match.** Compare the new run's per-table row counts against the **previous success row's `tables_detail`** (your Job 0 baseline). They should match ± the incremental window's natural drift. A table at a suspiciously round number — especially **exactly 10,000 or exactly 20** — is a truncation (§2.1 / §2.2), not a pass.
3. **Idempotent.** Run the sync again immediately: green again, and local table counts stable (upserts, not duplicates).
4. **No hidden AWS dependence.** Delete the `AWS_*` / `ATHENA_*` secrets (§3.2), restart, run the sync again: still green. This is the proof the old transport is actually gone.
5. **Scheduler + lock intact.** Let one scheduled slot fire on its own and confirm exactly one lock row / one run for that slot in `sync_logs` (the lock semantics were untouched, but observe it anyway).

## 5. Rollback

It's a branch plus the old secrets: check out the pre-migration branch (or revert the merge) and restore the `AWS_*` / `ATHENA_*` secrets — the app is back on the old transport in minutes. This is why the secrets are deleted only at verification step 4, after the code swap is already proven.

## 6. Done =

- [ ] Sync green through Citadel: `sync_logs` success rows, per-table counts matching the pre-migration baseline.
- [ ] `@aws-sdk/client-athena` uninstalled; `AWS_*` / `ATHENA_*` secrets **gone from the Repl**; a fresh run still green.
- [ ] Reads visible in Citadel's `athena_read_log` (the operator can confirm rows attributed to this app's id — bytes scanned, tables touched, latency).
- [ ] All changes on a branch; `athena-sync.ts`, the scheduler, mappers, and `shared/schema.ts` untouched (backfill chunking excepted).
