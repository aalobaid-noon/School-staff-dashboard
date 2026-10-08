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
- The operator-configured Noon sign-in callback is `/oauth/callback` on both the workspace HTTPS domain and the published HTTPS domain. Keep authorization requests aligned with these exact registered URLs. Production uses `DASHBOARD_OAUTH_REDIRECT_URI`; never substitute the workspace URL there. The API service owns the root callback path. Both development and production sign-in navigate in the same window, using Secure/HttpOnly/SameSite=None cookies so an embedded preview can receive its callback; development uses distinct cookie names. Google and browser restrictions on embedded authentication still apply.
- Citadel refresh tokens are AES-GCM encrypted in Postgres-backed server sessions with row-locked, single-use rotation across processes and restarts. The browser only receives an opaque, HttpOnly, Secure session cookie.
- Report access uses the `userType` and profile ID from the Citadel-verified dashboard session. ADMIN profiles receive the full report. SCHOOL_MANAGER profiles receive their assigned campuses. SCHOOL_LEAD profiles receive their assigned campuses and those campuses' facilitators, with only their own lead record. FACILITATOR profiles receive only their own metrics, students, and comments. Email domains and operations email lists do not grant report access. Missing or unsupported roles receive no school data; legacy sessions must sign in again to obtain a verified role.
- Both the HTML report and summary use server-side filtering. Facilitator views exclude campus exam totals, manager weekly series, and other staff records. Restricted reports omit global comparison data and rebuild grade/cohort dictionaries from the permitted rows. Run a report sync after deployment to include facilitators with fewer than five students. Assignments come from the latest reporting snapshot.
- The report shows the dashboard's signed-in email and role with a Switch profile link. This is a separate Noon session from the parent school workspace. The parent never supplies a role, profile ID, or session token to establish report access.
- Citadel reporting reads are app-wide; the raw, private snapshot is saved in `school_report_snapshots` and never exposed by an anonymous endpoint. The preview reveals readiness, not figures, until verified Noon sign-in. Sync is manual; frontend polling does not re-run the warehouse reads.

## Product

The imported dashboard is Arabic-first with an English toggle and summarizes school, lead, facilitator, attendance, exam, trust, and student follow-up metrics. Its live Citadel extract is stored privately in PostgreSQL. The preview shows sync readiness until verified Noon sign-in; authorized staff can then view the original reporting dashboard scoped to their schools.
The landing-page header always shows a prominent Noon sign-in button, independent of loading, error, data readiness, or session status. Noon sign-in also remains available before the first reporting import and when summary loading fails. Authentication and data readiness are separate: a verified sign-in without a snapshot returns to the landing page with a signed-in/waiting-for-data message. A private Replit deployment adds a separate access gate before Noon sign-in; allowing staff without Replit invitations requires a public login page, while report APIs stay Noon-protected.

Report imports are explicit and restricted to the approved central-operations Noon account. Development and production each need their own snapshot. The signed-in landing page provides a sync/resume action and server-locked access label; ordinary staff cannot select roles, initiate imports, or expand their assigned-school scope. A completed import opens the protected report in the same window.

The sync runs one warehouse read per authenticated request and stores private progress in PostgreSQL so an interrupted page can resume. Status polling never queries the warehouse. Only a completely validated snapshot is published atomically. Existing snapshots survive failures; temporary raw extracts are cleared after success/failure. Publishing this feature requires the additive `dashboard_sync_runs` schema change through the normal database publishing flow, not startup DDL or manual production SQL.

The user chose functional Synapse integration into this existing dashboard, including Noon connection and sign-in, rather than a source-only import or a separate app.

Users are Admins, School Managers, School Leads, and Facilitators. Only verified ADMIN profiles see all schools. Enforce each profile's data scope on the server, not only through interface filters.

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
