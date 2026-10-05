# School Staff Dashboard

An imported Noon school-manager dashboard with the original HTML, Athena refresh scripts, SQL queries, and documentation.

## Run & Operate

- `pnpm --filter @workspace/school-staff-dashboard run dev` — run the imported app preview through its managed workflow
- `python3 artifacts/school-staff-dashboard/source/build.py` — build the original dashboard after supplying the private extract
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
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
- `artifacts/school-staff-dashboard/source/data/real.json` — required private extract; intentionally not included in the public repository
- `integrations/synapse-starter/` — unmodified tracked source imported from noonAcademy/synapse-starter; reference only, not a second running app
- `artifacts/api-server/src/lib/synapse.ts` — server-only SDK client and Citadel metadata checks

## Architecture decisions

- Keep the imported repository intact under `source/`; don't edit upstream files as part of the preview wrapper.
- The source repository excludes its real data extract because it contains student and school data. Never replace it with mock data.
- The upstream `build.py` creates the standalone dashboard after `source/data/real.json` is supplied privately.
- Synapse is added to the existing Express server using the starter's vendored SDK packages and pnpm overrides; no GitHub package token is needed.
- Keep all Synapse credentials server-side. Do not expose arbitrary SQL, the builder console, or private school records through public routes.
- The workspace preview is not a privacy boundary. Student data must remain gated even in development.
- Noon sign-in requires an operator to whitelist the exact callback URL in Citadel's Replit Apps page before activation. A production callback must use the actual published URL, not the workspace URL.
- On Autoscale, do not use the starter's in-memory token store for Noon sign-in: server-side sessions and token rotation must work across processes and restarts.

## Product

The imported dashboard is Arabic-first with an English toggle and summarizes school, lead, facilitator, attendance, exam, trust, and student follow-up metrics. Live figures are unavailable until its private source extract is supplied.

The user chose functional Synapse integration into this existing dashboard, including Noon connection and sign-in, rather than a source-only import or a separate app.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
