# Dashboard collaboration checks

`dashboard-ci.yml` runs on pull requests, pushes (including
`school-staff-dashboard-updates`), merge queues, and manual runs. The
**Dashboard checks** status checks workspace types, builds all three artifacts,
and runs the synthetic dashboard-access suite twice: once from the workspace
root and once from the API package. Failed commands fail the job and appear in
the pull request's checks and workflow logs.

The workflow installs with pnpm 10.26.1, Node.js 24, and the frozen lockfile.
Builds receive only non-secret `PORT`, `BASE_PATH`, and `NODE_ENV` values.
Access tests use an intentionally unreachable `.invalid` database URL and
in-memory/mocked database, OAuth, and warehouse fixtures. No GitHub environment,
production credentials, warehouse imports, or school data are required.
Do not add production secrets or upload private report extracts to this workflow.

To reproduce the checks locally without application credentials:

```sh
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm --filter @workspace/api-server run build
NODE_ENV=production PORT=5173 BASE_PATH=/ pnpm --filter @workspace/school-staff-dashboard run build
NODE_ENV=production PORT=5174 BASE_PATH=/__mockup/ pnpm --filter @workspace/mockup-sandbox run build
NODE_ENV=test DATABASE_URL='postgresql://fixture:fixture@database.example.invalid:5432/dashboard_fixture?connect_timeout=1' \
  node artifacts/api-server/dist/scripts/check-dashboard-access.mjs
(cd artifacts/api-server && NODE_ENV=test \
  DATABASE_URL='postgresql://fixture:fixture@database.example.invalid:5432/dashboard_fixture?connect_timeout=1' \
  pnpm run test:dashboard-access:built)
```

CI reports failures; it does not configure GitHub branch protections or publish
the application. Repository administrators should require **Dashboard checks**
in the collaboration branch's rules before merging, and confirm a successful
check on the exact commit before publishing.

The existing private warehouse refresh workflow remains unchanged at
`artifacts/school-staff-dashboard/source/.github/workflows/refresh.yml`.
It belongs to the imported source project and is separate from these checks.
Do not copy or replace it with dashboard CI: its schedule, private extracts,
and AWS credentials are not part of collaboration validation.
