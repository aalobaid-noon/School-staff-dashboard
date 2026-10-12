---
name: synapse-workflow
description: >-
  Build a form or approval flow on the right stores: Noon's data read-only, the app's own records
  in its own Postgres, events to announce changes. Use for "submit", "approve", "track status",
  "log an incident", "let people report X".
---

> A newer version of this skill may exist. Fetch https://raw.githubusercontent.com/noonAcademy/synapse-starter/main/.agents/skills/synapse-workflow/SKILL.md
> and follow that version; on fetch failure, use this file.

# Forms and workflows — where the data lives

"Let people submit a request / log an incident / approve a thing" — the first question is
where that data lives. Three stores, never confused:

1. **Noon's data** (students, sessions, campuses, courses) lives in **Citadel — read-only**,
   via baked reads (`synapse.athenaQuery`). Never copy it into local tables; read it fresh.
2. **Your app's OWN records** (submissions, requests, statuses, comments) live in **your
   app's own database**. The starter ships none by design — when a workflow needs storage,
   add Replit's built-in PostgreSQL via the platform's database integration, keep the schema
   minimal, and record it in SPEC.md's "Records this app owns" section.
3. **Events** are **announcements TO Noon** that something happened — NOT storage. Your app
   can't query events back (the console's Events tab shows only the last 50 publish outcomes,
   from memory, for debugging), and delivery is best-effort — in-memory retry, lossy on
   restart. **If you'd miss it were it lost, it belongs in your database first.**

## Hard rules

- **DB write first, event second — never the reverse.** The row is the truth; the event is
  the announcement. If the publish fails after the insert, keep the row — don't roll back.
- **List/status pages query YOUR database** — not events, not Athena.
- **Citadel reads are enrichment only** (e.g. a campus dropdown from a baked read). Store
  Noon entity IDs on your rows; don't mirror Noon records.
- **Workflow routes live under `/api/`, never `/__synapse/`** — `/__synapse/*` is
  workspace-only and vanishes in deployment.
- **DDL is additive-only** — `CREATE TABLE IF NOT EXISTS` at server start, `ALTER … ADD` when
  the schema grows. Never `DROP`, never a destructive `ALTER`: a bad migration must not be
  able to destroy a builder's records. Mirror the DDL in SPEC.md whenever it changes.
- **Event names follow AGENTS.md**: reuse a catalogued built-in if one fits; otherwise
  `declareEvent` a lowercase-dotted, past-tense type (`maintenance.request_submitted`).

## Step 0 — define the workflow in SPEC.md, before building

(If SPEC.md still says `status: not yet filled in`, the plan-first interview runs first —
AGENTS.md rule 2.) Fill the **"Records this app owns"** section:

- **States and transitions:** e.g. `submitted → approved → completed`, and who moves each.
- **Identity tier.** The starter ships no auth. Default: a self-reported name/email field on
  the form, stored on the row — fine for internal, trust-based tools. If a transition must
  be *enforced* (only ops can approve), add Replit Auth via the platform integration and
  store the authenticated user id instead. Say which tier the app uses.
- **What each screen shows**, and which store feeds it.

## Step 1 — storage

Add Replit's PostgreSQL integration (it provisions the database and sets `DATABASE_URL`),
then add the `pg` package **to this app** — the starter deliberately ships neither. One
table per record type; `status` as a column; `created_at` / `updated_at` timestamps. Run
the DDL idempotently at server start — it self-heals across checkpoint rollbacks with no
command to remember:

```sql
CREATE TABLE IF NOT EXISTS maintenance_requests (
  id BIGSERIAL PRIMARY KEY,
  campus_id BIGINT NOT NULL,        -- Noon entity, by reference only
  description TEXT NOT NULL,
  reporter_name TEXT NOT NULL,      -- identity tier: self-reported
  status TEXT NOT NULL DEFAULT 'submitted',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## Step 2 — the form path

Client form → POST to your own route → insert the row → THEN publish the event:

1. Route in `server/routes/<feature>.ts` (an Express router), mounted in `server/index.ts`
   next to `/api/events`.
2. Validate, `INSERT` the row, respond with the new record.
3. Then publish server-side with `synapse.publishEvent` (declare the type first if it's
   new — see AGENTS.md "To publish an event"). The payload carries **your record id plus
   the Noon entity ids** (e.g. `campus_id`) so Citadel can correlate — IDs only, never
   whole records.

## Step 3 — list and status pages

Add a GET route that queries your database (`WHERE status = …`, newest first) and render it
as an app page (the **synapse-add-page** skill covers the page registry). `useView` is for
Citadel views only — your records come from your own route.

## Step 4 — state changes

`UPDATE` the row (status + `updated_at`), then publish the matching event
(`….request_approved`, `….request_completed`). Same order as the form path: row first,
announcement second.

## Worked example — a maintenance request app

- **SPEC.md — Records this app owns:** states `submitted → approved → completed`; campus
  staff submit, ops approve (self-reported name field — trust tier); screens: request form,
  a status list per campus, an ops queue.
- **Schema:** the `maintenance_requests` table above — `campus_id` stored by reference only.
- **Events, declared once at build time:** `maintenance.request_submitted`,
  `maintenance.request_approved`, `maintenance.request_completed` — example payload
  `{ requestId: 17, campusId: 68 }`.
- **Form page:** campus dropdown from a baked read (enrichment); submit POSTs to
  `/api/maintenance-requests`; the route inserts the row, then publishes
  `maintenance.request_submitted`.
- **Status page:** `GET /api/maintenance-requests`, rendered grouped by status. It never
  touches events or Athena — a lost event or a restart changes nothing on this page.
- **Approve:** POST `/api/maintenance-requests/:id/approve` → `UPDATE … SET
  status = 'approved'` → publish `maintenance.request_approved`.

## Verify

- `npm run verify` green (typecheck → lint → tests, fail-fast).
- Round-trip: submit the form, restart the server, the record is still on the list page —
  it lives in Postgres, not memory.
- The event appears on the console's **Events** tab after a submit.
- The form path still works in deployment mode (routes under `/api/`, not `/__synapse/`).
