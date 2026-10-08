# INTEGRATE.md — Add Synapse to an app that already exists

This guide is for an **AI coding agent** integrating Synapse (Noon's Citadel proxy) into an app that **already works and already has users**. The greenfield path — cloning this repo, the [`synapse-starter` scaffold](./README.md) — is not this. Here you are a **guest in someone else's working app, not an owner**.

This file is self-contained: everything you need is inlined below. For this **existing-app** path you need exactly three secrets from the operator (`SYNAPSE_APP_ID`, `SYNAPSE_APP_SECRET`, `SYNAPSE_BASE_URL` — section 7), all runtime-only. **The install itself needs no credential:** you vendor the `@noonacademy/*` tarballs the same way the `synapse-starter` template does (Gate 4). Everything else (including the data schema registry) is fetched live from Citadel.

You have exactly three jobs, in this order:

0. **Job 0 — Data-access scan** (section 3): a **strictly read-only** inventory of how the app consumes Noon data today, ending in a Migration Report. Every existing app runs this first — especially any app holding raw AWS credentials in its secrets.
1. **Job 1 — Connect the SDK**: read Noon data (Athena) + send events.
2. **Job 2 — Add Citadel per-user authentication** ("Sign in with Noon").

If Job 0 finds an Athena→Postgres sync (guide-shaped or hand-rolled), the transport migration itself lives in the sibling guide [`MIGRATE-SYNC.md`](./MIGRATE-SYNC.md). Job 0 only produces the report — it never migrates anything.

## The prime directive

**Every change is additive and reversible.** Never remove or rewrite a working path to add Citadel. Add alongside. Gate new behavior behind env vars / flags. Keep the old path intact until the new one is verified end-to-end. Do all work **on a branch**. The app must keep booting at every step — including with Citadel env absent.

> **Grounding notes (read before trusting this file blindly):**
>
> - `GET /api/registry` and `GET /api/registry/meta` (section 6) are implemented in Citadel. If the endpoint returns 404, it hasn't been deployed to the Citadel environment you're pointed at yet — stop and ask the platform team; do not guess table shapes.
> - `SYNAPSE_BASE_URL` is read by **your** app's code, not by Citadel. This starter bakes its default; an existing app must set it explicitly (section 7).
> - The `REPLIT_DEPLOYMENT` gating referenced in Job 2 step 4 is a pattern from this repo's template code (`server/index.ts`).

---

## 1. Pre-flight gates — check in order, STOP if one fails

Do not write integration code until every gate passes. (Job 0 writes no code, so it may run before the gates — it needs only the three `SYNAPSE_*` secrets, and only for its registry fetch.)

- [ ] **Gate 1 — Version control.** Create a branch (or at minimum a full snapshot). Reversibility before anything else. If the app has no git, `git init` + commit the current state first.

- [ ] **Gate 2 — Server-side runtime. ⛔ THE #1 BLOCKER.** The `app_secret` signs every request with HMAC-SHA256 via Node's `crypto` — it **must live and sign server-side only**. **If the app is frontend-only / static → STOP.** It needs a minimal backend shim first; there is no way to use the SDK from the browser without leaking the secret. Report this to the human before proceeding.

- [ ] **Gate 3 — Language / stack.**
  - Node/JS/TS backend → use `@noonacademy/synapse-sdk` (requires Node ≥ 20, per the package's `engines`).
  - Non-JS backend → do **not** fake it. Either hand-roll the signature (the whole scheme is the ~12 lines below) or add a tiny Node sidecar that owns the secret.

  ```javascript
  // utils/citadelAuth.js — the entire signing scheme
  const crypto = require('crypto');

  function createCitadelSignatureV1(path, rawBody) {
      const secret = process.env.SYNAPSE_APP_SECRET;
      const timestamp = Math.floor(Date.now() / 1000).toString(); // SECONDS, not ms
      const payloadToSign = `${timestamp}.${path}.${rawBody}`;    // GET → rawBody = ''

      const signature = crypto.createHmac('sha256', secret)
                              .update(payloadToSign)
                              .digest('hex');

      return `t=${timestamp},v1=${signature}`;
  }
  ```

  Every authenticated call to Citadel sends two headers (implemented by `buildHeaders` in `@noonacademy/citadel-transport`, the SDK's transport package — maintainer reference: noon-citadel `packages/citadel-transport/src/transport.ts`):

  ```http
  x-replit-app-id: <SYNAPSE_APP_ID>
  x-citadel-signature: t=<unix_seconds>, v1=<hmac_sha256_hex>
  ```

  The signed string is `` `${timestamp}.${pathAndSearch}.${rawBody}` `` — path **including query string**, and an empty string `""` as body for GET.

- [ ] **Gate 4 — Install path (tokenless by default).** The three `@noonacademy/*` packages ship as committed tarballs in the `synapse-starter` repo under [`vendor/`](./vendor/). Copy them into this app and depend on them by path — **no `.npmrc`, no registry, no `GITHUB_TOKEN`**:

  ```bash
  mkdir -p vendor
  cp /path/to/synapse-starter/vendor/noonacademy-*.tgz vendor/
  ```

  Then add all three to `package.json` — as direct `dependencies` **and** as overrides, with byte-identical specs. The overrides are not optional: `@noonacademy/synapse-sdk` declares its two siblings as semver ranges (`^0.3.0`, `^0.1.0`), and without an override those ranges resolve from the registry — which is exactly the 401 this avoids.

  ```jsonc
  "dependencies": {
    "@noonacademy/synapse-sdk":        "file:vendor/noonacademy-synapse-sdk-0.4.0.tgz",
    "@noonacademy/citadel-transport":  "file:vendor/noonacademy-citadel-transport-0.3.0.tgz",
    "@noonacademy/synapse-catalog":    "file:vendor/noonacademy-synapse-catalog-0.1.1.tgz"
  },
  "overrides": {                       // pnpm: use "pnpm": { "overrides": { … } } — same three specs
    "@noonacademy/synapse-sdk":        "file:vendor/noonacademy-synapse-sdk-0.4.0.tgz",
    "@noonacademy/citadel-transport":  "file:vendor/noonacademy-citadel-transport-0.3.0.tgz",
    "@noonacademy/synapse-catalog":    "file:vendor/noonacademy-synapse-catalog-0.1.1.tgz"
  }
  ```

  Prove it needs no credential — this must succeed with the token unset:

  ```bash
  env -u GITHUB_TOKEN npm install
  grep npm.pkg.github.com package-lock.json   # must print nothing
  ```

  Install **runtime deps only** — Replit's package firewall blocks CVE-flagged dev dependencies, so don't drag in dev tooling.

  **Trade-off, state it to the operator:** vendored tarballs pin the SDK version and never self-update. When Citadel's contract moves past a pinned version the failure surfaces at whatever call hits the changed surface, and *nothing announces it* — re-copy from the template to refresh.

  <details><summary>Opt-in alternative: install from GitHub Packages (live SDK updates, needs a token)</summary>

  Only if the operator wants the SDK to track releases without a re-copy. Add at the app root:

  ```ini
  @noonacademy:registry=https://npm.pkg.github.com
  //npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
  ```

  and set `GITHUB_TOKEN` (scope `read:packages`), then `npm i @noonacademy/synapse-sdk`. Note `${VAR}` expansion is an **npm** behaviour — confirm your installer does it (some environments hand the packager a shell without Replit Secrets, in which case the literal string `${GITHUB_TOKEN}` is sent and GitHub returns 401).

  If install fails, read the status code before changing anything — `401` and `403` have different causes:

  ```bash
  curl -s -o /dev/null -w '%{http_code}\n' \
    -H "Authorization: Bearer $GITHUB_TOKEN" \
    https://npm.pkg.github.com/@noonacademy%2fsynapse-sdk
  ```

  `401` = the credential was rejected at authentication, *before* scope is evaluated — the token is absent, unexpanded, expired, or not SSO-authorized for the org. An enabled `read:packages` scope does not rule this out. `403` = authenticated fine, scope or org policy denied it. `200` = the token is good and the fault is in the `.npmrc` wiring. **Don't debug a 401 by re-checking scopes** — fall back to the vendored path above and move on.

  </details>

- [ ] **Gate 5 — Secrets present & server-only.** Confirm `SYNAPSE_APP_ID`, `SYNAPSE_APP_SECRET`, `SYNAPSE_BASE_URL` are set (Replit Secrets, not committed files). Then **grep the client bundle** (e.g. `dist/`, `build/`, `.vite/`) and confirm the secret is never referenced client-side:

  ```bash
  grep -rn "SYNAPSE_APP_SECRET" client/ dist/ build/ 2>/dev/null   # must be empty
  ```

- [ ] **Gate 6 — Existing auth + routes.** Identify what auth the app has today (Replit OIDC? custom sessions? none?) and which routes it owns — `/api/login`, `/api/callback`, `/api/logout`, `/api/auth/user`, session middleware. Write them down. New auth is added **without colliding** with these (Job 2).

- [ ] **Gate 7 — Deployed URL known.** You need the app's deployed HTTPS URL to register the OAuth callback (`redirect_uri`) before login can work. If the app isn't deployed yet, note the workspace dev URL too.

- [ ] **Gate 8 — How it boots.** Read `.replit`, the start script, and the port binding. Your changes must not alter the run contract — same command, same port, same health behavior.

---

## 2. How you act differently from a greenfield build

| Greenfield (clone the starter) | Integrating (existing app) |
|---|---|
| Owns the whole codebase | **Guest** in a working app |
| Stack is known & opinionated | **Discovers** the stack first |
| Wires everything at once | **Additive, gated, one capability at a time, verify between each** |
| No legacy auth | Must **reconcile** existing auth carefully |
| Errors are fine (nothing live to break) | **App must keep booting at every step** |

---

## 3. Job 0 — Data-access scan (strictly read-only, run FIRST)

Several existing apps already consume Noon data the pre-Citadel way: raw shared AWS credentials in Replit Secrets driving a scheduled `Athena → local Postgres` sync. That architecture (mappers, upserts, scheduler, local reads) is fine and stays — but the transport must move to Citadel, because shared raw creds mean no per-app revocation and no audit trail. Job 0 finds out where this app stands. **It changes nothing: no installs, no code edits, no secret changes, and it never prints a secret value.** Its only output is the Migration Report below.

### 3.1 Inventory the app (local only, no network)

- [ ] **Secrets / env.** Which of these exist (report *presence only*, never values): `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, any `ATHENA_*` (e.g. `ATHENA_OUTPUT_LOCATION`, `ATHENA_WORKGROUP`)? **Any raw AWS credential is a ⚠️ security finding** — it is a shared credential with no per-app revocation and no audit trail. Also note `DATABASE_URL` (the app's own Postgres) and whether the three `SYNAPSE_*` secrets are already present.
- [ ] **Sync pattern.** Classify as exactly one of:
  - `guide-shaped sync` — the old internal guide's canonical layout exists: `server/athena.ts` (exports `runQuery(sql)`), `server/athena-sync.ts` (query builders + per-table sync fns + `syncAllFromAthena()`), `server/scheduler.ts`, and a `sync_logs` table (doubling as the slot lock) in `shared/schema.ts`.
  - `hand-rolled Athena` — Noon data reached some other way: grep for `@aws-sdk/client-athena`, `StartQueryExecution`, `noon2_replit`.
  - `no Noon data` — none of the above. The report is short; Jobs 1–2 proceed normally and `MIGRATE-SYNC.md` does not apply.
- [ ] **Views used.** From the query builders / SQL strings, extract every Athena view read (each `FROM <schema>.<view>`), and for each its **filter shape**: incremental (e.g. last-24h watermark), semester/backfill window, or full `SELECT *`.
- [ ] **Local mirror tables.** The tables in `shared/schema.ts` that mirror Athena views — and which of their columns the app's own request-time queries actually read (unused columns are future trim candidates, not part of the migration).
- [ ] **App-generated tables.** Tables holding the app's *own* data (user actions, app state). These correctly stay in local Postgres — **not** a migration target. List them so nobody "migrates" them by mistake.
- [ ] **Sync health.** The most recent `sync_logs` rows: status, started/finished timestamps (→ cadence), and per-table row counts (`tables_detail` if present). These row counts become the verification baseline in `MIGRATE-SYNC.md`.

### 3.2 Join against the live registry (the one network step)

Fetch `GET /api/registry` (section 6 — HMAC-signed like every `/api/*` call; the three `SYNAPSE_*` secrets must be in the environment). For each view the app uses, record whether it appears in the registry. The registry describes the same `noon2_replit` lake the old syncs read, so coverage should be near-total — a **miss is a finding to route to the data team**, not a blocker you improvise around. If the endpoint 404s (not yet deployed on this Citadel environment), record coverage as `unknown — registry endpoint not deployed` and flag it; do not guess.

### 3.3 Emit the Migration Report, then STOP

Fill this template and stop — **no code changes in Job 0**. The human decides what happens next.

```markdown
# Migration Report — <app name>

- **Stack / deployment:** <Node/Express/…, Replit workspace vs deployed URL>
- **Credentials found (presence only):**
  - ⚠️ `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `ATHENA_*`: <yes/no — any yes is a security line item: shared raw creds, no revocation, no audit>
  - `DATABASE_URL`: <yes/no>  ·  `SYNAPSE_*` (all three): <yes/no>
- **Pattern:** guide-shaped sync | hand-rolled Athena | no Noon data
- **Sync health:** <last N sync_logs rows: status · cadence · row counts>

## Athena views consumed

| View | Filter shape | ~rows/run (from sync_logs) | In registry? | Recommended path |
|---|---|---|---|---|
| `<schema>.<view>` | incremental last-24h | ~1,200 | yes | swap transport |
| `<schema>.<view>` | semester backfill | ~85,000 | yes | swap + chunked backfill |
| `<schema>.<view>` | full SELECT * | ? | **no** | not in registry — flag to data team |

## App-owned tables (stay local — not a migration target)

- `<table>` — <what it holds>

## Job 1 / Job 2 status

- Synapse SDK installed: <yes/no> · Noon sign-in present: <yes/no>

## Recommended sequence & risks

1. <e.g. Job 1 (SDK) → MIGRATE-SYNC.md transport swap → verify → delete AWS secrets → Job 2 if user auth is wanted>
- Risks: <e.g. backfill branch exceeds the 10k-row cap and must be chunked; view X missing from registry>
```

Recommended-path vocabulary: **`swap transport`** (incremental sync fits inside Citadel's per-query limits — see `MIGRATE-SYNC.md`), **`swap + chunked backfill`** (any full/semester backfill must be windowed under the 10k-row cap — recipe in `MIGRATE-SYNC.md`), **`not in registry — flag`** (route to the data team; do not migrate that view yet).

---

## 4. Job 1 — Connect the SDK (reads + events)

The SDK surface (from `@noonacademy/synapse-sdk`; maintainer reference: noon-citadel `packages/synapse-sdk/README.md`):

- `createSynapseClient({ baseUrl, appId, appSecret })` → `SynapseClient`. **Throws** on a missing field.
- `publishEvent(type, payload)` → `Promise<{ status: 'accepted', eventId } | { status: 'queued' }>`.
- `declareEvent(name, { description, examplePayload })` → `Promise<DeclareEventResult>` — `{ status: 'created' | 'suggested' | 'blocked', ... }`.
- `athenaQuery({ sql, maxRows?, nextToken?, executionId? })` → `Promise<AthenaPage>` — one page: `{ columns: string[], rows: AthenaRow[], executionId: string, nextToken?: string }`. Each `AthenaRow` is `Record<string, string | null>` (Athena returns every value as a string keyed by column name).
- `athenaQueryAll({ sql, maxRows? })` → `AsyncGenerator<AthenaRow>` — follows `nextToken` across pages for you.
- `getRecentPublishes({ limit? })` → newest-first array of terminal publish outcomes `{ type, status, eventId?, error?, attempts, at }`.
- `close()` — stops the background retry drainer (call on shutdown).

### 4.1 Install (runtime deps only)

- [ ] Copy the three tarballs from the template's `vendor/` into this app's `vendor/`, per Gate 4.
- [ ] Add all three to `dependencies` **and** `overrides` with identical `file:` specs (pnpm: `pnpm.overrides`) — the overrides are what keep the SDK's internal `@noonacademy/*` ranges off the registry.
- [ ] `env -u GITHUB_TOKEN npm install`, then confirm `grep npm.pkg.github.com package-lock.json` prints nothing.

### 4.2 One server-side module, constructed nullable

Exactly one file touches the credentials. `createSynapseClient` **throws** on missing `baseUrl`/`appId`/`appSecret`, so check env first and **never throw at import** — the app must still boot with no Citadel env at all.

```ts
// server/citadel.ts — the ONLY file that reads SYNAPSE_* env
import { createSynapseClient, type SynapseClient } from '@noonacademy/synapse-sdk';

const appId = process.env.SYNAPSE_APP_ID;
const appSecret = process.env.SYNAPSE_APP_SECRET;
const baseUrl = process.env.SYNAPSE_BASE_URL;

export const configError: string | null =
  appId && appSecret && baseUrl
    ? null
    : 'Citadel disabled: set SYNAPSE_APP_ID, SYNAPSE_APP_SECRET, SYNAPSE_BASE_URL';

export const citadel: SynapseClient | null = configError
  ? null
  : createSynapseClient({ baseUrl: baseUrl!, appId: appId!, appSecret: appSecret! });
```

Every consumer checks `if (!citadel)` and degrades (503 + `configError`), never crashes.

### 4.3 Namespaced server routes — the browser never holds the SDK

The frontend calls **your** server; your server calls Citadel. Namespace the new routes (e.g. `/citadel/*`) so they cannot collide with existing ones.

```ts
app.post('/citadel/events', async (req, res) => {
  if (!citadel) return res.status(503).json({ error: configError });
  const result = await citadel.publishEvent(req.body.type, req.body.payload);
  res.json(result); // { status: 'accepted', eventId } | { status: 'queued' }
});

// SQL is baked at build time (see 4.4) — NEVER user-supplied.
const NAMED_QUERIES = {
  activeProfiles: 'SELECT id, name FROM noon2_core.profile LIMIT 100',
} as const;

app.post('/citadel/query', async (req, res) => {
  if (!citadel) return res.status(503).json({ error: configError });
  const sql = NAMED_QUERIES[req.body.name as keyof typeof NAMED_QUERIES];
  if (!sql) return res.status(400).json({ error: 'Unknown query name' });
  res.json(await citadel.athenaQuery({ sql }));
});
```

Behavior you can rely on (from the SDK):

- `publishEvent` retries transient failures (network, timeout, `408`/`429`/`5xx`) via an in-memory queue with backoff; permanent failures (`400`/`401`/`403`/`422`) throw `SynapseError` immediately.
- `athenaQuery` is synchronous request/response (no queue, no retry); only `SELECT` / `WITH … SELECT` is allowed, a default row limit applies server-side, and pagination needs `nextToken` **and** `executionId` together — or just use `athenaQueryAll` to stream all rows.
- `declareEvent(name, { description, examplePayload })` registers a custom event type; the outcome comes back as data: `created` | `suggested` | `blocked`. Declare once at startup, then `publishEvent` the same name.

### 4.4 Reads come from the live registry

Before writing any Athena SQL, fetch the schema registry **at build time** (section 6) to learn real tables, columns, enums, and business rules. Author the named queries from what it says, bake them into `NAMED_QUERIES`, and re-fetch the registry whenever you change queries. **Never bundle the registry file into the app** — always fetch it live so your knowledge stays current.

### 4.5 Verify before touching any UI

- [ ] **Ping**: `GET /api/whoami` (HMAC headers, empty body) returns `{ "client": "<your app name>" }`.
- [ ] **Write**: publish one test event, then confirm `citadel.getRecentPublishes({ limit: 1 })[0].status === 'accepted'`.
- [ ] **Read**: run one named query; confirm rows come back.
- [ ] **Degradation**: unset the `SYNAPSE_*` env vars, restart — the app must still boot; `/citadel/*` routes return 503 with `configError`.

Only after all four pass, wire the frontend to the new routes.

---

## 5. Job 2 — Add Citadel per-user auth (riskiest — do it LAST, on the branch)

The exact reference for this flow is the **migration prompt** shipped on the Citadel portal's AI-agents page (maintainer reference: noon-citadel `app/components/ai-agents/AiPromptsCard.tsx`, `MIGRATION_PROMPT`). Follow its flow; the field names below are corrected against the live handlers. Background write-ups live in noon-citadel (`OAUTH_FLOW.md`, `SAMPLE_REPLIT_APP.md`) — everything you need from them is inlined here.

### 5.1 Operator prerequisite FIRST — register the callback URL

Login is **rejected** until the app's deployed callback URL is whitelisted. A human operator sets it on the *Replit Apps* page of the Citadel portal (backed by `PUT /api/replit-apps/:id/redirect-uri` — a portal-session endpoint, not an HMAC one). Rules from the handler: comma-separated exact URLs allowed; `https://` required except `localhost` / `127.0.0.1`; prefix matching is disabled in production. If the app uses the embed widgets, `authorizedOrigins` must be set the same way (`PUT /api/replit-apps/:id/authorized-origins`).

**Stop and ask the operator to do this before writing auth code.**

### 5.2 The OAuth contract (Authorization Code flow)

1. **Redirect** the user to:

   ```text
   https://<CITADEL_DOMAIN>/portal/oauth/authorize
     ?app_id=<SYNAPSE_APP_ID>          ← app_id, NOT client_id
     &redirect_uri=<exact whitelisted callback URL>
     &response_type=code
     &state=<csrf_state saved in session>
   ```

2. **Exchange the code** — server-to-server, HMAC headers required, path signed is `/api/oauth/token`:

   ```text
   POST https://<CITADEL_DOMAIN>/api/oauth/token
   headers: content-type, x-replit-app-id, x-citadel-signature
   body:    { "code": "<code from callback>" }
   ```

   Response is **nested**: `{ "token": { "accessToken", "refreshToken", "type": "Bearer", "expiresIn" }, "profile": { ... } }`.

3. **Refresh** — HMAC headers again, path signed is `/api/oauth/refresh`:

   ```text
   POST https://<CITADEL_DOMAIN>/api/oauth/refresh
   body: { "refreshToken": "<stored refresh token>" }     ← camelCase
   ```

   Response is **flat**: `{ "accessToken": "...", "refreshToken": "..." }`. Refresh tokens are single-use — the old one is consumed and a new one returned; always overwrite both. `401` means the session is dead: send the user through login again.

4. **GraphQL calls on behalf of the user** — dual headers, both required:

   ```text
   POST https://<CITADEL_DOMAIN>/graphql
   x-replit-app-id: <SYNAPSE_APP_ID>
   x-citadel-signature: t=<ts>, v1=<sig>          ← app origin
   Authorization: Bearer <user accessToken>       ← human identity
   ```

Field names that bite (each verified against the live handlers):

| Where | Correct | Common mistake |
|---|---|---|
| Authorize URL query | `app_id` | `client_id` |
| Token exchange body | `code` | sending only OAuth2 boilerplate without `code` |
| Refresh body | `refreshToken` | `refresh_token` (snake_case → 400) |
| Signature timestamp | Unix **seconds** | milliseconds |

Profile shape (from the exchange response): `{ id, name, avatarUri, locale, userType, account: { email } }`. Resolve email as `profile.email || profile.account?.email`.

### 5.3 New login path + server-side session store

- [ ] Add **new** routes (or rewire existing ones per the migration prompt — but only if the old auth is being retired *after* verification). If the app has live Replit OIDC, keep it working and add Citadel login alongside; cut over only after 5.6 passes.
- [ ] Store per user, server-side (session store or DB — never the browser): `accessToken`, `refreshToken`, `profileId`, `email`, `expiresAt`.
- [ ] On 401 / expiry: refresh via 5.2 step 3, update the stored pair, retry the original request once; on refresh failure return 401.

### 5.4 Gate the deployed auth — don't lock yourself out

Enforce the new auth **only in deployments** while testing (this starter gates under `REPLIT_DEPLOYMENT`, which Replit sets only in deployed apps). The workspace/dev URL stays open so you can keep iterating even if login is misconfigured. For local dev over HTTP: `cookie.secure = NODE_ENV === "production"`, keep `httpOnly: true` and `sameSite: "lax"` — `secure: true` on localhost breaks OAuth state continuity.

### 5.5 Staff-only

Citadel's `/api/oauth/login` already returns **403 for non-staff accounts** (maintainer reference: `filterStaffPortalProfiles` in noon-citadel `src/services/portalAuthProfiles.ts`). Still enforce the domain allowlist app-side on the resolved email, per the migration prompt: `@noonacademy.com`, `@noon.edu.sa`, `@non.sa` — block anything else with 403.

### 5.6 Verify (all of these, in order)

- [ ] Sign in as yourself end-to-end: redirect → consent → callback → session created.
- [ ] A per-user read returns **your** identity (e.g. your email/profile from the stored session).
- [ ] Sign-out clears the session; token refresh works (force-expire and confirm a request still succeeds).
- [ ] A logged-out user still gets the intended public/gated behavior — no accidental lockout of existing users.

---

## 6. The registry contract (fetch at build time, never bundle)

- **`GET /api/registry`** — HMAC-authed like every `/api/*` call (same two headers; GET, so the signed body is `""`).
  - **200** → the live `athena-registry.ts` text (`Content-Type: text/plain`) — tables, columns, enums, business rules for writing Athena SQL. Response carries `ETag`, `Last-Modified`, `X-Registry-Source`.
  - Send `If-None-Match` with a previously seen `ETag` → **304** when unchanged.
  - Registry temporarily unavailable → **503** (never 500). **Stop and tell the operator**, then retry later; don't fall back to guessed or bundled schemas.
- **`GET /api/registry/meta`** (optional) → JSON `{ version, lastModified, bytes, source }` for cheap version checks.

Use it at **build time**: fetch, read, author named queries from it, bake those into the app (4.3). Do not ship the registry text in the bundle and do not re-fetch it per request at runtime.

---

## 7. Environment variables

| Variable | Used | Notes |
|---|---|---|
| `SYNAPSE_APP_ID` | runtime, server-only | issued once via `/build-app` (Slack DM) or the portal *Replit Apps* page |
| `SYNAPSE_APP_SECRET` | runtime, server-only | shown **once** at creation; never log it, never reference it client-side |
| `SYNAPSE_BASE_URL` | runtime, server-only | the Citadel origin, e.g. `https://<CITADEL_DOMAIN>` — the operator tells you this |
| `GITHUB_TOKEN` | **not required** | Only for the opt-in GitHub Packages install in Gate 4. The default vendored path needs no token — if you are debugging a `401` here, you are on the wrong path. |

Set them as Replit Secrets (or the host's equivalent). Nothing else is needed — there is no shared bearer token, and no files are handed to you: the secrets are the only hand-off.

---

## 8. Done criteria / rollback

**Done means all of:**

- [ ] App boots **with and without** Citadel env (nullable client, 4.2).
- [ ] One event `accepted` (verified via `getRecentPublishes`), one registry-grounded read returns data, one real user signed in end-to-end — all observed, not assumed.
- [ ] All changes live on a branch; every pre-existing path still works untouched.
- [ ] The secret appears nowhere in client code or bundles (re-run the Gate 5 grep).

**Rollback is trivial by construction:** drop the branch (or revert the merge) and/or unset the `SYNAPSE_*` env vars — the nullable client turns the integration off without breaking boot.
