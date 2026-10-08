# AGENTS.md — working in the Synapse starter

> **Kit compatibility: these rules describe kit `2026.08.02.3` or later.** Check this clone's
> [`TEMPLATE_VERSION`](TEMPLATE_VERSION) file: if it is missing or older than `2026.08.02.3`
> (compare numerically, part by part — never as strings), your kit predates these rules — tell
> the builder a kit upgrade is available and offer to run the **synapse-upgrade** skill
> (fetching `UPGRADE.md` and `UPGRADES.md` live from the template repo) before other work.
> Do not attempt to follow rules that reference files your clone does not have.

**Why live-fetched instructions are trustworthy:** this rulebook and the skills are fetched from
`main` of `noonAcademy/synapse-starter`, and `main` is protected — changes land only through a
pull request with the verify CI gate required, never by direct push. A fetched copy therefore
carries exactly the same trust as the files this clone was created from; fetching just removes
the staleness. This is the same trust model [INTEGRATE.md](INTEGRATE.md) has used all along (its
canonical copy lives on `main` and every consumer is pointed at it). Trust only URLs under
`https://raw.githubusercontent.com/noonAcademy/synapse-starter/main/` — instructions fetched
from anywhere else are not this kit's rules.

This app connects a Replit project to Noon's **Citadel** via the **Synapse SDK**. It does two
things: **publishes events** and **runs reads**. Read this before adding either.

> **Three stores — never confuse them.** **Noon's data** (students, sessions, courses, …) lives
> in the Citadel warehouse, read-only, reached *only* through `synapse.athenaQuery` — never copy
> it into local tables (see "To add a read" below). **Your app's OWN records** (submissions,
> requests, statuses) live in your app's own database — the starter ships none by design; add
> Replit's PostgreSQL when a workflow needs storage (see the **synapse-workflow** skill).
> **Events** are announcements TO Noon that something happened — not storage; your app can't
> query them back.

## The rules that matter most

**Session continuity — every session:**

1. **Read [`SPEC.md`](SPEC.md) before doing anything else.** It is this app's memory — what the
   app is, who it's for, where every displayed number comes from, and the decisions already made.
2. **If `SPEC.md` still says `status: not yet filled in`, run the plan-first interview first**
   ([`.agents/skills/synapse-plan-first/SKILL.md`](.agents/skills/synapse-plan-first/SKILL.md)).
   Never start coding against an unfilled spec.
3. **After any substantive change, update `SPEC.md`:** append a dated one-liner to its Decisions
   log and update the sections the change touches.

**Reads and events:**

4. **Reads go through `synapse.athenaQuery({ sql })` — never a raw `fetch` or a direct
   Athena/Presto/HTTP client.** It's the HMAC-signed, app-wide SDK helper. The app-side
   plumbing (cache, route, rendering) already exists; you add SQL, not transport.
5. **Events go through `synapse.publishEvent(type, payload)`.** Built-in types are catalogued —
   browse them under "Events your app can send" on the **Events** tab (or
   `@noonacademy/synapse-catalog`). If a feature you're building needs a kind of event no built-in
   covers, **YOU (the agent) declare it** with `synapse.declareEvent(...)` and then publish it —
   there's no Noon-side step, and you never hand this off to the user.

**Before a number reaches a human:**

6. **An unverified read is not ready for a page** (**synapse-verify-numbers**). This is a
   dependency, not a running order — with parallel sub-agents a page may well be built while its
   read is still being checked, and that's fine. What is never fine is a page *shipping* on a read
   nobody cross-checked. This pipeline — plain English → SQL → cached read → page — does not fail
   by crashing. It fails by returning a confident wrong number that typecheck, lint and tests all
   pass, and the builder asked for the number *because* they don't have it, so they cannot catch
   it. Cross-check it a second independent way, then say so in language they can judge.
7. **The platform owns functional browser testing; you own the data and the tokens.** Replit's
   Agent tests the app it builds in a real browser — buttons, forms, links, APIs — and does it
   more cheaply than you can. Don't re-drive the app clicking things. Spend your attention on what
   it cannot judge: whether the number is right (rule 6), and whether the look still comes from
   tokens (Conventions below). Outside Replit — local `npm run dev`, or an app following
   [INTEGRATE.md](INTEGRATE.md) — `npm run visual` is available as a layout pass.

**The scaffolding/app split:**

8. **`/synapse` is Synapse's corner of the app; everything else belongs to the builder.** The
   `/synapse` page (`client/app/pages/synapse.tsx`, reached only from the shell's footer link)
   holds the starter's example views and status — frozen scaffolding, never extended. New pages,
   views, and features live in the builder's app: `client/app/pages/` and the app nav.

## Who owns what — the upgrade contract

This app was cloned from the `synapse-starter` template, and the template keeps improving.
Upgrades are recipe-driven ([`UPGRADE.md`](UPGRADE.md) is the how, [`UPGRADES.md`](UPGRADES.md)
is the what) — **never a blind merge from the template** — and they are only safe because every
path in the repo has exactly one owner. The machine-readable contract is
[`.synapse/ownership.json`](.synapse/ownership.json); this is the same contract in words:

- **Synapse-owned** — the template's to manage; an upgrade may overwrite, add, or delete here.
  The console (`client/console/`), the skills (`.agents/skills/`, `skill/`), `vendor/`,
  `scripts/`, `.github/`, the server scaffolding (`server/**`), the client primitives
  (`client/useView.ts`, `client/sendEvent.ts`, …), the docs (`AGENTS.md`, `README.md`,
  `INTEGRATE.md`, `replit.md`, upgrade files), tooling configs, and exactly two files inside
  the app surface: `client/app/pages/synapse.tsx` and `client/app/blocks/ViewBlock.tsx`.
  A synapse-owned pattern claims **only files the template actually ships** — a file the
  builder created that happens to match (e.g. a new file under `server/`) is builder-owned.
- **Builder-owned** — **never touched by an upgrade.** The app surface is released to the
  builder at clone time: everything under `client/app/` (pages, `AppShell.tsx`,
  `LoginScreen.tsx`, `config.ts`, `home.tsx` — even though the template shipped them),
  `server/queries/` (including the example read), `SPEC.md`, and any path nothing else claims.
  Upgrades may *create* a file at a path the clone doesn't have, but never edit or delete an
  existing one.
- **Shared** — both sides edit; upgrades change these only via the guided edits in an
  `UPGRADES.md` entry, preserving the builder's additions: `package.json` (+ lockfile —
  regenerated, never copied), `server/index.ts`, the two registries
  (`server/queries/index.ts`, `client/app/pages/index.ts`), `client/app/theme.css`,
  `client/index.html` (RTL lives here), `.replit`.

Precedence is most-specific-wins (`client/app/pages/synapse.tsx` beats `client/app/**`).

> **⛔ Definition of done for ANY template-repo PR — check before you commit or push.**
> If your diff touches a **synapse-owned** path, it is not done until you have **also**:
> 1. bumped [`TEMPLATE_VERSION`](TEMPLATE_VERSION) (`YYYY.MM.DD`, `.N` for a same-day second bump), and
> 2. appended an [`UPGRADES.md`](UPGRADES.md) entry — what changed, why a clone cares, the ensure-recipe, and how to verify.
>
> Run **`npm run check:release`** to confirm (it's the exact check CI runs, and a committed
> `.githooks/pre-push` gate — active in this repo via `npm install`'s `prepare` step — blocks a
> push that fails it). This is a maintainer rule for the template repo only; it's inert in clones.
> Full procedure and rationale: [`RELEASING.md`](RELEASING.md).

## To add a read

1. **Describe the data you want** and let the SQL skill write it: open
   [`skill/SKILL.md`](skill/SKILL.md) (the Noon SQL analyst — Trino/Presto, all the business
   rules and gotchas). It will clarify scope, pick the right table from the registry, and
   write a correct `SELECT`.
2. **Bake the final SELECT** into `server/queries/<name>.sql.ts`, exporting
   `{ name, title, description, sql, registryVersion, skillVersion }` (no params — reads are
   app-wide). Register it in [`server/queries/index.ts`](server/queries/index.ts).
   `registryVersion` is the **registry stamp**: copy the `stamp` field from
   `/__synapse/registry/status` verbatim — never invent or compute one (the contract lives in
   [`server/registry.ts`](server/registry.ts); the skill's "Bake the read" section has the exact step).
3. The read route (`GET /__synapse/reads/:name`) runs it through `synapse.athenaQuery`, caches
   the rows (~1h), and the **Views** tab renders them. Worked example:
   [`server/queries/courses-by-type.sql.ts`](server/queries/courses-by-type.sql.ts).

Don't hand-write SQL transport, and don't read data any other way.

## To add a page to your app

The **shipped app** — what end users see at `/` — lives in [`client/app/`](client/app/), separate
from the workspace-only console. Add a page by creating `client/app/pages/<name>.tsx` that exports
`{ path, title, nav, Page }` and registering it in
[`client/app/pages/index.ts`](client/app/pages/index.ts) — the same file-plus-registry shape as a
read. Style it with the theme tokens (Conventions below), and put it in the app's nav — never on
the `/synapse` scaffolding page (rule 8).

An app page is built from two client primitives — data in, events out — with any React you like
in between (a dashboard, a chart, a game):

- **Data in** — render a view as a ready-made table with `<ViewBlock name="<read-name>" />`, or for
  a custom UI read the rows yourself with the **`useView(name)`** hook
  ([`client/useView.ts`](client/useView.ts)) and lay them out however you want. Both read the public
  `/api/views/:name`. If the page needs data no existing read covers, add the read first (above).
- **Events out** — report something to Noon from any interaction (a click, a completed level) with
  **`sendEvent(type, payload)`** ([`client/sendEvent.ts`](client/sendEvent.ts)). It POSTs to
  `/api/events`, which publishes server-side via `synapse.publishEvent` (the app secret never reaches
  the browser). The event `type` must already exist — a built-in, or one you declared (below);
  `sendEvent` publishes, it does not declare. Reference Noon entities by ID in the payload.

## To publish an event

Events go through `synapse.publishEvent(type, payload)`. When a feature you're building emits a
new kind of event:

1. **Reuse a catalogued built-in** if one reasonably fits — prefer this. Built-ins are browsable
   under "Events your app can send" on the **Events** tab (or `@noonacademy/synapse-catalog`), and
   they keep their payload autocomplete.
2. **If none fits, declare it yourself** — don't stop, don't ask the user:

   ```ts
   const res = await synapse.declareEvent('task.reassigned', {
     description: 'Sent when a task is moved from one assignee to another.',
     examplePayload: { taskId: 90210, fromUserId: 11, toUserId: 42 },
   });
   ```

   Then handle the result:
   - **created** → it's yours; publish it now.
   - **suggested** → an existing type already covers this — use the suggested type instead.
   - **blocked** → read the reason, fix the name or description, and retry.

   Names are **per-app** (the same name in another app is fine; you can't reuse a built-in or one
   you've already declared in this app), **lowercase-dotted**, and **past-tense** —
   `namespace.thing_happened`.
3. **Then publish it:** `synapse.publishEvent('task.reassigned', payload)`.

(Declared types are runtime strings, so they get **no payload autocomplete** — built-ins still do.
That's expected.)

### Payload conventions

The **example payload you pass to `declareEvent` IS the contract** — Citadel derives the shape from
it, so nobody hand-authors a schema. Make it realistic but schematic, and follow these conventions
(Citadel enforces only a minimum shape, so they're on you, here):

- **Reference Noon entities by ID — never paste whole records.** `{ "courseId": 12345 }`, not the
  course object.
- **Keep it flat and minimal** — just the fields that define what happened.

**Defining the event is the agent's job.** Never tell the user to "ask Noon" or hand them a form —
you declare it in the server code you're writing, the same way you call `synapse.athenaQuery` for
reads.

## Skills

Deeper recipes live as agent skills. Reach for them by task.

**Skills are fetched live at trigger time.** Before following any skill below, fetch its live
copy from `https://raw.githubusercontent.com/noonAcademy/synapse-starter/main/<its path>` (each
skill's own header carries its exact URL) and follow that version; on fetch failure, use the
local file. The local files stay — they are the trigger surface and the fallback — but the
source of truth is the template's `main`.

| Skill | Use when |
|---|---|
| [`.agents/skills/synapse-plan-first/SKILL.md`](.agents/skills/synapse-plan-first/SKILL.md) (**synapse-plan-first**) | Starting any new build ("build me…"), or `SPEC.md` still says "not yet filled in" — interviews the builder one question at a time, verifies the data exists, and writes SPEC.md for approval before any code. |
| [`skill/SKILL.md`](skill/SKILL.md) (**noon-sql-analyst**) | Writing any SQL against Noon data — reads, counts, analyses. Knows the registry, business rules, and Athena gotchas; bakes the final SELECT as a read. |
| [`.agents/skills/synapse-verify-numbers/SKILL.md`](.agents/skills/synapse-verify-numbers/SKILL.md) (**synapse-verify-numbers**) | **Immediately after writing or changing any read, before wiring it to a page** — cross-checks the number a second independent way with probes (`POST /__synapse/probe`), hunts join fan-out and trend cliffs, and reports it in language the builder can judge. Also when anyone doubts a displayed figure. |
| [`.agents/skills/synapse-add-page/SKILL.md`](.agents/skills/synapse-add-page/SKILL.md) (**synapse-add-page**) | Adding a page, dashboard, screen, or chart to the shipped app — the end-to-end read → `useView`/`ViewBlock` → page recipe. |
| [`.agents/skills/synapse-chart/SKILL.md`](.agents/skills/synapse-chart/SKILL.md) (**synapse-chart**) | Any chart, graph, trend or visual breakdown — `<ChartBlock>`, choosing the form from the data's shape, the theme's chart palette, and keeping the figures reachable. |
| [`.agents/skills/synapse-scheduled-job/SKILL.md`](.agents/skills/synapse-scheduled-job/SKILL.md) (**synapse-scheduled-job**) | Anything recurring — "every Monday", "each morning", "alert me when" — a job in `server/jobs/` run by a Replit Scheduled Deployment. |
| [`.agents/skills/synapse-access-control/SKILL.md`](.agents/skills/synapse-access-control/SKILL.md) (**synapse-access-control**) | "Only X should see this", managers-only, anything confidential — roles by email/domain in `server/access.ts`, enforced server-side on the view routes. |
| [`.agents/skills/synapse-arabic-rtl/SKILL.md`](.agents/skills/synapse-arabic-rtl/SKILL.md) (**synapse-arabic-rtl**) | Arabic-first or RTL apps — `dir`/`lang`, Arabic font stack, logical properties, bidi-safe Latin runs, Arabic number/date formatting, mirrored charts. |
| [`.agents/skills/synapse-workflow/SKILL.md`](.agents/skills/synapse-workflow/SKILL.md) (**synapse-workflow**) | Any form → workflow feature — "submit a request", "log an incident", "approve", "track status", "let people report/log X" — the three-stores rule, per-app Postgres storage, and the row-first-event-second recipe. |
| [`.agents/skills/synapse-event-design/SKILL.md`](.agents/skills/synapse-event-design/SKILL.md) (**synapse-event-design**) | Tracking or instrumenting anything — which moments deserve events, `publishEvent` vs `sendEvent`, `declareEvent`, payload and naming rules, verifying delivery. |
| [`.agents/skills/synapse-error-report/SKILL.md`](.agents/skills/synapse-error-report/SKILL.md) (**synapse-error-report**) | Something broke and needs escalating — produces a structured, paste-ready report for the Synapse Slack channel (never includes secret values). |
| [`.agents/skills/synapse-upgrade/SKILL.md`](.agents/skills/synapse-upgrade/SKILL.md) (**synapse-upgrade**) | The builder asks to "upgrade the synapse kit" / "update synapse", or the console Home tab shows "Kit update available" — applies the template's per-version recipes from `UPGRADES.md`, following `UPGRADE.md` exactly; never touches builder-owned paths. |

## Where things live

| Path | What it is |
|---|---|
| [`SPEC.md`](SPEC.md) | **The app's memory** — what this app is, who uses it, where every number comes from, events, scope, and the Decisions log. Read it first, every session; keep it current (rules 1–3 above). |
| [`TEMPLATE_VERSION`](TEMPLATE_VERSION), [`UPGRADES.md`](UPGRADES.md), [`UPGRADE.md`](UPGRADE.md), [`.synapse/ownership.json`](.synapse/ownership.json) | **The kit upgrade path** — which template version this clone is on, the per-version change log + recipes, the agent guide for applying them, and the ownership map that makes it safe ("Who owns what" above). |
| [`server/citadel-schema.ts`](server/citadel-schema.ts) | **The data registry snapshot** — Athena tables (columns, types, enums, grain, example queries) + `BUSINESS_RULES`. Browse it in the **Get data** tab. The **source of truth is Citadel's live `GET /api/registry`** (HMAC-authed, ETag'd — contract in [INTEGRATE.md §5](INTEGRATE.md)); this snapshot stands in until that endpoint is deployed on the staging Citadel this app targets, after which it will be deleted and fetched live at build time. In the workspace, `GET /__synapse/registry` serves the live text when Citadel answers (else this snapshot, labeled), and the **Get data** tab shows which source you're browsing. |
| [`skill/SKILL.md`](skill/SKILL.md) | The SQL-analyst skill. Use it to write reads. |
| [`server/queries/`](server/queries/) | Baked reads (`<name>.sql.ts`) + their registry. |
| [`server/probe.ts`](server/probe.ts) | The **cross-check primitive** behind synapse-verify-numbers: `POST /__synapse/probe` runs one throwaway, read-only, uncached SELECT so a number can be proved a second way without baking a temp read. Workspace-only. |
| [`server/metrics.ts`](server/metrics.ts) | **What the app's words mean.** Named metric definitions ("active student") that reads declare and carry to the page with their rows, so two pages can't quietly disagree about the same word. The machine-checkable half of SPEC.md's number table. |
| [`server/query-cost.ts`](server/query-cost.ts) | Boot-time warnings for reads that will scan more than they need — a partitioned table with no `dt` filter, `SELECT *` over a fact table, a row read with no `LIMIT`. Warnings only; never blocks. |
| [`server/access.ts`](server/access.ts) | **Who may see what** in a deployment: roles by email/domain, and which views they gate. Enforced in `/api/views/:name`, never in the browser. Empty in a fresh clone = every signed-in staff member sees everything. |
| [`server/jobs/`](server/jobs/) | Scheduled work (`<name>.job.ts`) + its registry, run by `npm run job -- <name>` from a Replit Scheduled Deployment — a separate process with its own secrets and no read cache. |
| [`client/app/blocks/ChartBlock.tsx`](client/app/blocks/ChartBlock.tsx) | `ViewBlock`'s sibling: the same read drawn as a chart, bound to the theme's `--color-chart-*` palette, RTL-aware, with the figures kept reachable as a table. |
| [`scripts/visual-check.ts`](scripts/visual-check.ts) | `npm run visual` — an **optional** layout pass for non-Replit use (local `npm run dev`, INTEGRATE.md apps): drives the app at phone and desktop widths, asserts layout, writes screenshots to `.synapse-visual/`. On Replit the Agent's own browser testing covers this; there is no skill for it. Playwright is installed on demand, not a template dependency. |
| [`scripts/check-theme-tokens.ts`](scripts/check-theme-tokens.ts) | `npm run check:theme` (in `verify`) — fails when `client/app/**` holds a raw hex, a Tailwind palette class, an arbitrary value, or an inline style. **A check, not a rule**: Replit's Design Canvas writes visual edits straight to the codebase without running an agent loop, so no skill can defend the token convention. Mark a genuine exception with a `theme-tokens-ignore` comment. |
| [`server/synapse.ts`](server/synapse.ts) | Constructs the SDK client from secrets; exports `null` (not a throw) when secrets are missing. |
| [`server/reads.ts`](server/reads.ts), [`server/athena.ts`](server/athena.ts), [`server/query-cache.ts`](server/query-cache.ts) | Read orchestration, the `athenaQuery` wrapper + result normaliser, and the in-memory cache. |
| [`server/index.ts`](server/index.ts) | Express server. Mounts the workspace-only `/__synapse/*` endpoints (the builder console's data) **only when `REPLIT_DEPLOYMENT` is unset**; the public `/api/views*` (data in) and `/api/events` (events out) endpoints — the shipped app's surface — are mounted in every mode. |
| [`client/console/`](client/console/) | The workspace-only **Synapse** management console (Home / Get data / Views / Events / Settings tabs). |
| [`client/app/`](client/app/) | The **shipped app** rendered at `/` for end users. Pages live in `client/app/pages/<name>.tsx` (a registry, like `server/queries/`); views render as blocks via `client/app/blocks/ViewBlock.tsx`. The `/synapse` page there is the starter's frozen scaffolding corner (example views + status). |
| [`client/app/theme.css`](client/app/theme.css) | **The app's entire look** — Tailwind v4 `@theme` tokens (color, radius, type, density) with three documented presets. Restyling the app = editing this file (see Conventions). |
| [`client/useView.ts`](client/useView.ts), [`client/sendEvent.ts`](client/sendEvent.ts) | The app's two building blocks: **`useView(name)`** loads a view's rows (data in); **`sendEvent(type, payload)`** reports to Noon (events out). Build any page/feature/game on these two. |

## Schema / dialect facts

- The registry's canonical home is Citadel: `GET /api/registry` serves the live registry text
  (same HMAC headers as every `/api/*` call; 200 + `ETag` / 304 / 503 — see
  [INTEGRATE.md §5](INTEGRATE.md)). The bundled `server/citadel-schema.ts` is a snapshot of it;
  when the live endpoint is reachable, trust it over the snapshot.
- SQL dialect: **Amazon Athena (Trino/Presto-compatible)**. Main schema: `noon2_datamart`.
- Reads are **app-wide** (app-level HMAC auth), **not per-user** — there is no per-user scope
  injection here. Prefer dimension/aggregate tables and app-wide aggregates.
- The lake refreshes roughly every 12h; the app caches reads for ~1h, so rendered rows are at
  most ~1h behind a refresh.

## Conventions

- **The app's look lives in [`client/app/theme.css`](client/app/theme.css) tokens only.** App
  pages and components consume the semantic utilities those tokens generate (`bg-surface`,
  `text-ink`, `rounded-card`, `p-card`, …) and never hardcode colors, radii, fonts, or density —
  restyling the app means editing theme.css (activate a preset, tweak tokens), nothing else.
  The console (`client/console/`, `client/ui.tsx`) keeps its own fixed styling and is never
  themed. Direction is not a token: an RTL app sets `dir`/`lang` on `<html>` in
  `client/index.html`.
  **This one is enforced, not just stated:** `npm run check:theme` (inside `verify`) fails the
  build on a raw hex, a Tailwind palette class (`bg-slate-700`), an arbitrary value (`bg-[#fff]`),
  or an inline style anywhere in `client/app/**`. It is a check rather than a rule because
  Replit's Design Canvas applies visual edits **straight to the codebase without running an agent
  loop** — nothing reads this file on that path, so prose alone can't hold the line. If a value
  genuinely can't be a token (Recharts needs literal colors, for instance), mark the line
  `theme-tokens-ignore` so the exception is visible in review. If a canvas edit trips the check,
  don't add the marker — move the value into a token in `theme.css` and point the component back
  at it.
- TypeScript, ESM (`type: module`). Server uses NodeNext resolution — **relative imports need a
  `.js` extension** (e.g. `import { runRead } from './reads.js'`).
- Verify with **`npm run verify`** (secret scan → typecheck → lint → tests → link check → theme
  tokens, fail-fast) before
  you're done. The
  same gate runs before every deployment, so a red check here is a blocked deploy there.
- Don't commit a `package-lock.json` (the template ships without one — see the README) or `.env`.
