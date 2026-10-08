# Synapse starter

A clone-and-own Replit template that connects your app to Noon's **Citadel**: live Noon
data in, events out, all through the Synapse SDK. You clone it, paste three secrets, and
press **Run** — it comes up connected. The SDK ships with the template (committed
tarballs under [`vendor/`](vendor/)), so no GitHub token or registry access is needed.

> **Two journeys, one front door:**
>
> - **Starting a new app?** You're in the right place — follow the setup below.
> - **Already have an app?** Point your coding agent at [`INTEGRATE.md`](./INTEGRATE.md) —
>   the self-contained guide for adding the SDK and Citadel auth to an existing app. Apps
>   still syncing Athena with raw AWS credentials swap the transport via
>   [`MIGRATE-SYNC.md`](./MIGRATE-SYNC.md).

## Get started (clone → secrets → Run)

1. **Mint app credentials.** In the Citadel **staging** portal, open `/portal/replit-apps`
   → **Create app**. Copy the `app_id` and `app_secret` — the secret is shown once and is
   not recoverable.
2. **Clone this repo into Replit** via the import URL.
3. **Paste three secrets** into Replit's Secrets pane (the 🔒 icon):

   | Secret | What it is |
   |---|---|
   | `SYNAPSE_APP_ID` | From step 1. |
   | `SYNAPSE_APP_SECRET` | From step 1 — shown once, keep it safe. |
   | `SYNAPSE_BASE_URL` | Which Citadel to talk to: `https://citadel.staging.noonedu.io`. (Left unset, the app falls back to that same staging URL.) |

4. **Press Run.** The app installs, builds, boots, and announces itself to Citadel by
   publishing an `app_booted` event. You'll know it worked when the log shows:

   ```
   [synapse] OK — app_booted accepted eventId=<N>
   ```

   That one line proves the whole path: the SDK installed, your secrets reached the
   server, the request was signed correctly, and Citadel accepted an event attributed to
   your app. It also shows up as ✓ accepted on the console's **Events** tab.

**If it didn't work:**

- `Missing required Replit Secret(s): …` — a secret is missing or misspelled. Add it and
  press **Run** again.
- `[synapse] app_booted queued (couldn't reach Citadel on first try)` — the SDK enqueued
  the event and will retry in the background. Check `SYNAPSE_BASE_URL` and that staging
  is up.

## The two surfaces

One codebase serves two different pages, and it picks the right one by where it's
running:

- **The builder console** ([`client/console/`](client/console/)) — the **Synapse**
  management page you see in the Replit **workspace** webview. It's for you, the builder:
  check the connection, browse Noon data, watch events. It is **never part of a published
  deployment** — the `/__synapse/*` endpoints behind it are only mounted while the app is
  running in the workspace.
- **Your app** ([`client/app/`](client/app/)) — the product end users see at `/` once you
  publish a deployment, behind a **"Sign in with Noon"** login (see
  [Deploying](#deploying-your-app)). This is the part you and your coding agent build out
  with pages.

To preview your app in the workspace without deploying, add `?surface=app` to the webview
URL (`?surface=console` forces the console back).

## The console tabs

- **Home** — connection status and the main starting point: describe the data you want in
  plain English and it hands you a ready-made instruction to paste to the Replit agent.
- **Get data** — a searchable browser over the Noon data registry (tables, columns, enum
  values, example queries); pick a table and turn it into an agent instruction.
- **Views** — every data view your app ships, with live rows, the SQL behind them, and a
  "data as of" freshness note.
- **Events** — what your app has sent to Noon since it last started (accepted / failed,
  with event IDs), plus the catalog of event types it can send.
- **Settings** — how your app connects to Noon: app ID, Citadel base URL, connection
  health.

## How data works

All Noon data lives in Citadel's warehouse and is read through one SDK call —
`synapse.athenaQuery({ sql })` — never a raw fetch or a direct database connection.

- **Baked reads.** Each read is a file at `server/queries/<name>.sql.ts` exporting
  `{ name, title, description, sql, registryVersion, skillVersion }`, registered in
  [`server/queries/index.ts`](server/queries/index.ts). The SQL is fixed at authoring
  time, so it's reviewable in a PR diff and traceable to the schema it was written
  against. One worked example ships:
  [`courses-by-type.sql.ts`](server/queries/courses-by-type.sql.ts).
- **Where reads show up.** The console's **Views** tab renders them, and your app reads
  the same data through the public `/api/views/:name` endpoints — as a ready-made table
  with `<ViewBlock />` or as raw rows with the `useView` hook. Rows are cached in memory
  for about an hour (the lake itself refreshes roughly every 12h), and the cache resets on
  restart.
- **The registry.** [`server/citadel-schema.ts`](server/citadel-schema.ts) is a bundled
  snapshot of the Citadel data registry — tables, columns, enums, business rules — and is
  what the **Get data** tab browses. Its source of truth is Citadel's live
  `GET /api/registry` endpoint ([`INTEGRATE.md`](./INTEGRATE.md) has the contract); the
  snapshot stands in until that endpoint is deployed on the staging Citadel this template
  targets.
- **The SQL skill.** [`skill/SKILL.md`](skill/SKILL.md) is the Noon SQL analyst — it
  knows the tables, the business rules, and the gotchas, and it writes and bakes correct
  reads. You don't write SQL: describe the data you want and let the agent use the skill.

## How events work

Events are how your app tells Noon something happened — "a student joined", "a level was
completed".

- **Server-side**, events publish through `synapse.publishEvent(type, payload)`.
- **From the browser**, any interaction can call
  [`sendEvent(type, payload)`](client/sendEvent.ts), which POSTs to `/api/events` and
  publishes server-side — the app secret never reaches the browser.
- Event types are catalogued: browse them under "Events your app can send" on the
  **Events** tab. If no built-in type fits, the coding agent declares a new one with
  `synapse.declareEvent(...)` — no Noon-side step needed (details in
  [`AGENTS.md`](AGENTS.md)).
- Every publish outcome lands on the **Events** tab. The list is in-memory, so it resets
  when the app restarts.

## Deploying your app

Publishing the Replit deployment puts **your app** (never the console) at your
`*.replit.app` URL, behind "Sign in with Noon" — Citadel's own OAuth flow, using the app
credentials you already have. No extra identity-provider setup, no secret anyone has to
hand you. Before deploying, add two more values in Replit's Secrets pane:

| Value | What it is |
|---|---|
| `APP_OAUTH_REDIRECT_URI` | `https://<your-app>.replit.app/oauth/callback` — must exactly match the redirect URI registered for your app in the Citadel portal. |
| `APP_SESSION_SECRET` | A random secret you mint yourself (e.g. `openssl rand -hex 32`); it signs the app's session and OAuth-state cookies. |

Then one portal click: in the Citadel portal go to **Replit Apps → your app → redirect
URI** and register the callback URL. The match is exact and `https://` is required —
sign-in fails until the registered URI and `APP_OAUTH_REDIRECT_URI` are identical.

**If any of this is missing, the deployment fails closed:** every request gets a 503
rather than serving Noon data to anyone unauthenticated, and the missing value is named in
the deployment log. Your workspace is unaffected either way — the builder console never
needs these and stays open.

**Broken code cannot deploy.** The deployment build runs `npm run build:deploy`, which
chains the full check suite (`npm run verify`: secret scan → typecheck → lint → tests,
fail-fast) before
building — a red check fails the build and the previous deployment keeps serving. The
console header shows the same checks live (green "All checks pass" / red with the failing
step's output), so you'll know before you press Deploy. Only deployments pay this cost;
the workspace **Run** button skips verify and stays fast.

## Running locally

```bash
cp .env.example .env   # fill in the same values
npm install            # no token needed — the SDK installs from the tarballs in vendor/
npm run dev            # server + client with hot reload, one port (default 3000)
```

Checks: `npm run verify` (secret scan → typecheck → lint → tests, fail-fast — the same gate every
deployment build runs). Don't commit `.env`. The `package-lock.json` IS committed — with the
SDK vendored there's no private-registry auth to break it, so a lockfile keeps installs
reproducible. (Maintainers: [`scripts/sync-sdk.md`](scripts/sync-sdk.md) covers refreshing
the vendored SDK tarballs when a new version is published.)

## For coding agents

Working in this repo, or pointing an agent at it? Start with [`AGENTS.md`](AGENTS.md) —
the rules for reads, events, and app pages — and use [`skill/SKILL.md`](skill/SKILL.md)
whenever you need SQL over Noon data.
