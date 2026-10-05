# School Staff Dashboard

An imported Noon school-manager dashboard with the original HTML, Athena refresh scripts, SQL queries, and documentation.

## Run & Operate

- `pnpm --filter @workspace/school-staff-dashboard run dev` — run the imported app preview through its managed workflow
- `python3 artifacts/school-staff-dashboard/source/build.py` — build the original dashboard after supplying the private extract
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/api-server run sync:dashboard` — fetch all seven original report reads through Citadel, validate using the original assembler in a private temporary directory, then save an atomic reporting snapshot to development PostgreSQL
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/school-staff-dashboard/source/` — tracked files imported from the upstream GitHub repository
- `artifacts/school-staff-dashboard/src/` — Replit preview and import-status screen
- `artifacts/school-staff-dashboard/source/src/app.html` — original dashboard markup, CSS, and JavaScript
- `artifacts/school-staff-dashboard/source/data/real.json` — original standalone build's private extract; intentionally not included in the public repository or needed for this workspace preview
- `integrations/synapse-starter/` — unmodified tracked source imported from noonAcademy/synapse-starter; reference only, not a second running app
- `artifacts/api-server/src/lib/synapse.ts` — server-only SDK client and Citadel metadata checks

## Architecture decisions

- Keep the imported repository intact under `source/`; don't edit upstream files as part of the preview wrapper.
- The source repository excludes its real data extract because it contains student and school data. Never replace it with mock data.
- The upstream `build.py` creates the standalone dashboard after `source/data/real.json` is supplied privately.
- Synapse is added to the existing Express server using the starter's vendored SDK packages and pnpm overrides; no GitHub package token is needed.
- Keep all Synapse credentials server-side. Do not expose arbitrary SQL, the builder console, or private school records through public routes.
- The workspace preview is not a privacy boundary. Student data must remain gated even in development.
- The development Noon sign-in callback is `/api/dashboard/oauth/callback` on the workspace HTTPS domain. An operator must whitelist the exact URL in Citadel's Replit Apps page before login works. Production needs `DASHBOARD_OAUTH_REDIRECT_URI` set to the separately whitelisted published HTTPS URL, not the workspace URL.
- Citadel refresh tokens are AES-GCM encrypted in Postgres-backed server sessions with row-locked, single-use rotation across processes and restarts. The browser only receives an opaque, HttpOnly, Secure session cookie.
- Only explicitly approved central-operations accounts named in the server environment `DASHBOARD_OPS_EMAILS` may view all schools. Otherwise, Noon profile IDs must match a campus's registered managers, and all report arrays are scoped on the server. No account is implicitly central operations.
- Citadel reporting reads are app-wide; the raw, private snapshot is saved in `school_report_snapshots` and never exposed by an anonymous endpoint. The preview reveals readiness, not figures, until verified Noon sign-in. Sync is manual; frontend polling does not re-run the warehouse reads.

## Product

The imported dashboard is Arabic-first with an English toggle and summarizes school, lead, facilitator, attendance, exam, trust, and student follow-up metrics. Its live Citadel extract is stored privately in PostgreSQL. The preview shows sync readiness until Noon sign-in is registered; authorized staff can then view the original reporting dashboard scoped to their schools.

The user chose functional Synapse integration into this existing dashboard, including Noon connection and sign-in, rather than a source-only import or a separate app.

Users are school managers and central operations. Each manager sees only their assigned schools; central operations sees all schools. Enforce this access on the server, not only through interface filters.

The dashboard must support both desktop and phone use.

The first version must connect all existing dashboard reports to live Noon data while preserving their existing calculations.

Staff must be able to save follow-up notes and statuses, not only view reports. Store these app-owned records separately from the read-only Noon warehouse.

Saved follow-ups use Open → In progress → Resolved, with no approval stage. Any manager assigned to the school, plus central operations, can update or resolve that school's follow-ups.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
