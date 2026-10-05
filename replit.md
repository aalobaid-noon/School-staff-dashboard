# School Staff Dashboard

An imported Noon school-manager dashboard with the original HTML, Athena refresh scripts, SQL queries, and documentation.

## Run & Operate

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

## Architecture decisions

- Keep the imported repository intact under `source/`; don't edit upstream files as part of the preview wrapper.
- The source repository excludes its real data extract because it contains student and school data. Never replace it with mock data.
- The upstream `build.py` creates the standalone dashboard after `source/data/real.json` is supplied privately.

## Product

The imported dashboard is Arabic-first with an English toggle and summarizes school, lead, facilitator, attendance, exam, trust, and student follow-up metrics. Live figures are unavailable until its private source extract is supplied.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
