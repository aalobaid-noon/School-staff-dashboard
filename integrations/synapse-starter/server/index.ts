import { readFileSync } from 'node:fs';
import { createServer as createHttpServer, type Server } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SYNAPSE_EVENT_TYPES } from '@noonacademy/synapse-catalog';
import type { PublishEventResult } from '@noonacademy/synapse-sdk';
import express, { type Application } from 'express';
import { canAccessView } from './access.js';
import { asAthenaClient } from './athena.js';
import { buildEndUserAuthDeps, type EndUserAuthDeps, installEndUserAuth } from './auth-routes.js';
import { formatBootLog } from './boot.js';
import { buildCatalog } from './catalog.js';
import { recentPublishes } from './events.js';
import { buildKit, latestVersionFetcher, readTemplateVersion } from './kit.js';
import { formatMetricProblems } from './metrics.js';
import { buildOverview } from './overview.js';
import { runProbe } from './probe.js';
import { listBakedQueries } from './queries/index.js';
import { formatCostWarnings } from './query-cost.js';
import { runRead } from './reads.js';
import { readsFreshness, registryFetcher } from './registry.js';
import { chooseBrowseTables } from './registryParse.js';
import { buildSetup, readSpecText } from './setup.js';
import {
  appOauthRedirectUri,
  appSessionSecret,
  authConfigError,
  synapse,
  synapseAppId,
  synapseAppSecret,
  synapseBaseUrl,
  synapseConfigError,
} from './synapse.js';
import { projectTables } from './tables.js';
import { verifyRunner } from './verify.js';

const here = dirname(fileURLToPath(import.meta.url));
// One cached fetcher for the process — the console Home tab polls /__synapse/kit on every
// visit, but GitHub is asked at most once an hour.
const latestVersion = latestVersionFetcher();
// One registry fetcher for the process: ETag + text cached in its closure, so revalidation is
// a 304 round-trip, not a re-download. Falls back to the committed snapshot (read lazily) on
// missing secrets or any Citadel failure — see server/registry.ts.
const getRegistry = registryFetcher({
  creds: synapseConfigError
    ? null
    : { baseUrl: synapseBaseUrl, appId: synapseAppId ?? '', appSecret: synapseAppSecret ?? '' },
  snapshotText: () => readFileSync(resolve(here, './citadel-schema.ts'), 'utf8'),
});
const isDev = process.env.NODE_ENV === 'development';
const isReplitDeployment = Boolean(process.env.REPLIT_DEPLOYMENT);
const port = Number(process.env.PORT ?? 3000);
const host = '0.0.0.0';

// Assembles the Express app's routes. Split out from the HTTP-server/dev/static wiring so tests can
// drive the exact route + gate ordering without spinning up Vite or reading the built client.
export function buildApp(opts: {
  isReplitDeployment: boolean;
  authDeps?: EndUserAuthDeps | null;
}): Application {
  const app = express();

  // Workspace-only inspection surface for the builder console (Home / Get data / Views /
  // Events / Settings tabs). Registered before the client middleware so the SPA catch-all
  // doesn't swallow it, and hidden once the app is a published Replit deployment so none of
  // it is exposed to end users.
  if (!opts.isReplitDeployment) {
    // Settled publish outcomes since boot.
    app.get('/__synapse/events', (_req, res) => {
      res.json(recentPublishes(synapse));
    });

    // App identity + live-ish connection check.
    app.get('/__synapse/overview', (_req, res) => {
      res.json(
        buildOverview({
          appId: synapseAppId,
          baseUrl: synapseBaseUrl,
          configError: synapseConfigError,
          recentPublishes: recentPublishes(synapse),
        }),
      );
    });

    // The Citadel registry, projected for the Get data tab's table browser. Live-parsed from
    // Citadel when reachable (same fetch+cache as /__synapse/registry, just structured instead of
    // raw text), else the committed snapshot. The live parse is trusted only when it yields at
    // least as many tables as the snapshot — a short parse (registry format drift) falls back to
    // the snapshot rather than showing a truncated list. X-Tables-Source says which one you got.
    app.get('/__synapse/tables', async (_req, res) => {
      const snapshot = projectTables();
      try {
        const { status, text } = await getRegistry();
        const { tables, source } = chooseBrowseTables({ source: status.source, text }, snapshot);
        res.setHeader('x-tables-source', source);
        res.json(tables);
      } catch (err) {
        console.error(
          '[synapse] tables route fell back to snapshot:',
          err instanceof Error ? err.message : err,
        );
        res.setHeader('x-tables-source', 'snapshot');
        res.json(snapshot);
      }
    });

    // The registry as TEXT, live from Citadel when reachable (ETag-revalidated per request),
    // else the committed snapshot — the agent's freshest source when writing SQL (the SQL
    // skill curls this). X-Registry-Source/-Reason say which one you got. Workspace-only,
    // like every /__synapse route: a deployed app never fetches the registry at runtime.
    app.get('/__synapse/registry', async (_req, res) => {
      try {
        const { status, text } = await getRegistry();
        res.setHeader('x-registry-source', status.source);
        if (status.reason) res.setHeader('x-registry-reason', status.reason);
        res.type('text/plain').send(text);
      } catch (err) {
        console.error('[synapse] registry route failed:', err instanceof Error ? err.message : err);
        res.status(500).json({ error: 'registry failed' });
      }
    });

    // Freshness only (no text): the Get data tab's quiet source banner, the stamp an agent
    // copies into a baked read's `registryVersion` (skill/SKILL.md "Bake the read"), and the
    // per-read staleness verdicts behind the Home tab's quiet stale-reads notice.
    app.get('/__synapse/registry/status', async (_req, res) => {
      try {
        const { status } = await getRegistry();
        res.json({ ...status, reads: readsFreshness(status.stamp, listBakedQueries()) });
      } catch (err) {
        console.error(
          '[synapse] registry status failed:',
          err instanceof Error ? err.message : err,
        );
        res.status(500).json({ error: 'registry status failed' });
      }
    });

    // Catalogued event types the SDK knows about (read-only).
    app.get('/__synapse/catalog', (_req, res) => {
      res.json(buildCatalog(SYNAPSE_EVENT_TYPES));
    });

    // List the baked reads this app ships.
    app.get('/__synapse/reads', (_req, res) => {
      res.json(
        listBakedQueries().map((q) => ({
          name: q.name,
          title: q.title,
          description: q.description,
        })),
      );
    });

    // First-run setup state for the Home tab's checklist: secret PRESENCE (names + booleans
    // only — values never leave the server) and whether SPEC.md has been filled in. The
    // checklist's other two checks reuse /__synapse/overview and /__synapse/verify.
    app.get('/__synapse/setup', (_req, res) => {
      const specText = readSpecText(resolve(here, '../SPEC.md'));
      res.json(buildSetup({ env: process.env, specText }));
    });

    // Kit-update discovery for the Home tab: local TEMPLATE_VERSION vs the public template
    // repo's current one (fetched fail-silent, cached ~1h in latestVersion's closure). A newer
    // template renders as a quiet notice, never a red check — and never blocks anything.
    app.get('/__synapse/kit', async (_req, res) => {
      const local = readTemplateVersion(resolve(here, '../TEMPLATE_VERSION'));
      res.json(buildKit({ local, latest: await latestVersion() }));
    });

    // Run the repo's verify chain (typecheck -> lint -> tests) and report per-step results for
    // the console's verify chip. A failing step is a normal 200 response, and concurrent
    // requests share one in-flight run (verify.ts). The try/catch exists for the same reason as
    // the read route's below: verifyRunner.run() never rejects, but that guarantee shouldn't be
    // load-bearing for Express 4's error handling.
    app.get('/__synapse/verify', async (_req, res) => {
      try {
        res.json(await verifyRunner.run());
      } catch (err) {
        console.error('[synapse] verify route failed:', err instanceof Error ? err.message : err);
        res.status(500).json({ error: 'verify failed to run' });
      }
    });

    // Run one baked read (cache -> athenaQuery -> rows). runRead never rejects (read failures
    // become an `error` field), but Express 4 doesn't forward a rejected async handler to error
    // middleware, so the try/catch keeps that guarantee from resting on runRead's discipline.
    app.get('/__synapse/reads/:name', async (req, res) => {
      try {
        const result = await runRead(asAthenaClient(synapse), req.params.name);
        if (!result) {
          res.status(404).json({ error: `unknown read: ${req.params.name}` });
          return;
        }
        res.json(result);
      } catch (err) {
        console.error('[synapse] read route failed:', err instanceof Error ? err.message : err);
        res.status(500).json({ error: 'read failed' });
      }
    });

    // Run one throwaway, read-only SELECT — the cross-check primitive behind the
    // synapse-verify-numbers skill. Uncached and unregistered: this is how an agent proves a
    // baked read's number is right (count it a second way, spot-check one entity, look for a
    // cliff in the trend) without baking, registering and then forgetting to delete a temp read.
    // Workspace-only like every /__synapse route, so no deployment ever exposes ad-hoc SQL.
    // runProbe never rejects — bad SQL comes back as an `error` field — but the try/catch keeps
    // this route's 500-free guarantee from resting on that discipline (as above).
    app.post('/__synapse/probe', express.json(), async (req, res) => {
      const sql = typeof req.body?.sql === 'string' ? req.body.sql : '';
      try {
        res.json(await runProbe(asAthenaClient(synapse), sql));
      } catch (err) {
        console.error('[synapse] probe route failed:', err instanceof Error ? err.message : err);
        res.status(500).json({ error: 'probe failed' });
      }
    });
  }

  // "Sign in with Noon" gate for the deployed app ONLY. Mounted BEFORE the public /api/views routes
  // and (later, in createServerInstance) the SPA catch-all, so it guards both: unauthenticated API
  // calls get 401 and page loads are redirected to /login, while the login screen's own routes and
  // static assets are allowlisted. Never mounted in the workspace, so the builder console stays open.
  // If the auth config is incomplete, the deployment FAILS CLOSED: rather than serving Noon data and
  // the SPA to anyone, every request gets a 503. An auth boundary must not fall open on misconfig
  // (the specific missing config is still surfaced in the boot log).
  if (opts.isReplitDeployment) {
    if (opts.authDeps) {
      installEndUserAuth(app, opts.authDeps);
    } else {
      app.use((_req, res) => {
        res.status(503).json({ error: 'authentication is not configured' });
      });
    }
  }

  // Public read API for the shipped app. Unlike /__synapse/* (workspace-only), these are mounted
  // in EVERY mode — the app the builder ships renders live views for end users through them. Same
  // baked reads, same cache; just the product-facing surface. Registered before the SPA catch-all
  // so the client middleware doesn't swallow them.
  // Access is enforced only in a deployment — that's where end users exist. Passed explicitly
  // rather than inferred from "is there a session?", so a request arriving without one is never
  // mistaken for a trusted one (see server/access.ts).
  const enforceAccess = opts.isReplitDeployment;

  app.get('/api/views', (req, res) => {
    const email = req.noonUser?.email ?? null;
    res.json(
      listBakedQueries()
        .filter((q) => canAccessView(q.name, email, enforceAccess).allowed)
        .map((q) => ({
          name: q.name,
          title: q.title,
          description: q.description,
        })),
    );
  });

  app.get('/api/views/:name', async (req, res) => {
    try {
      // Checked BEFORE the read runs: a refused viewer must not cost an Athena query, and the
      // 403 must not depend on whether the query happened to succeed. 404 for an unknown view is
      // answered first so a restricted name isn't distinguishable from a nonexistent one by
      // status code alone.
      const decision = canAccessView(req.params.name, req.noonUser?.email ?? null, enforceAccess);
      if (!decision.allowed) {
        console.warn(
          `[synapse] denied ${req.params.name} to ${req.noonUser?.email ?? 'anonymous'} (needs: ${decision.requiredRoles.join(', ')})`,
        );
        res.status(403).json({ error: 'You do not have access to this data.' });
        return;
      }
      const result = await runRead(asAthenaClient(synapse), req.params.name);
      if (!result) {
        res.status(404).json({ error: `unknown view: ${req.params.name}` });
        return;
      }
      res.json(result);
    } catch (err) {
      console.error('[synapse] view route failed:', err instanceof Error ? err.message : err);
      res.status(500).json({ error: 'view failed' });
    }
  });

  // Public event API for the shipped app — the events-out primitive (client/sendEvent.ts). Any
  // interaction can report to Noon by POSTing { type, payload }; the server holds the app secret and
  // calls synapse.publishEvent, so the client never sees it. In a deployment this sits behind the
  // sign-in gate above (only a signed-in user can send). The event type must already exist — a
  // built-in, or one the agent declared at build time; this route publishes, it does not declare.
  app.post('/api/events', express.json(), async (req, res) => {
    const type = typeof req.body?.type === 'string' ? req.body.type.trim() : '';
    const rawPayload = (req.body as { payload?: unknown } | undefined)?.payload;
    const payload =
      rawPayload && typeof rawPayload === 'object' ? (rawPayload as Record<string, unknown>) : {};

    if (!type) {
      res.status(400).json({ error: 'an event "type" is required' });
      return;
    }
    if (!synapse) {
      res.status(503).json({ error: 'not connected to Noon yet — add your app secrets' });
      return;
    }

    try {
      // publishEvent is typed to built-in catalog types; declared types are runtime strings, so we
      // publish the caller's type through a string-accepting view of the same method.
      const publish = synapse.publishEvent as (
        t: string,
        p: Record<string, unknown>,
      ) => Promise<PublishEventResult>;
      res.json(await publish(type, payload));
    } catch (err) {
      console.error('[synapse] event route failed:', err instanceof Error ? err.message : err);
      res.status(502).json({ error: 'could not send the event' });
    }
  });

  return app;
}

async function createServerInstance(): Promise<Server> {
  // Wire the deployed-app auth gate from resolved config. Reuses the Citadel base URL + app secret
  // for the oauth calls; a dedicated APP_SESSION_SECRET signs the identity cookie. Null (and a boot
  // log) when anything's missing, which leaves the gate unmounted.
  const authDeps = isReplitDeployment
    ? buildEndUserAuthDeps({
        baseUrl: synapseBaseUrl,
        appId: synapseAppId,
        appSecret: synapseAppSecret,
        redirectUri: appOauthRedirectUri,
        sessionSecret: appSessionSecret,
        secure: isReplitDeployment,
      })
    : null;
  if (isReplitDeployment && !authDeps) {
    console.error(`[synapse] ${authConfigError ?? 'Sign in with Noon disabled (misconfigured).'}`);
  }

  const app = buildApp({ isReplitDeployment, authDeps });
  const httpServer = createHttpServer(app);

  if (isDev) {
    const { createServer } = await import('vite');
    // hmr.server reuses this HTTP server so dev stays on ONE port — without it,
    // Vite opens a separate HMR WebSocket on :24678, which Replit won't forward.
    const vite = await createServer({
      server: { middlewareMode: true, hmr: { server: httpServer } },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const clientDist = resolve(here, '../dist/public');
    app.use(express.static(clientDist));
    app.get('*', (_req, res) => {
      res.sendFile(resolve(clientDist, 'index.html'));
    });
  }

  return httpServer;
}

// Athena bills by bytes scanned and the builder never sees the bill, so a read that scans a whole
// fact table is invisible unless something says so. Printed at boot — the one moment the builder
// is already reading the log — rather than hidden behind a command nobody runs.
function warnAboutCostlyReads(): void {
  const warning = formatCostWarnings(listBakedQueries());
  if (warning !== null) console.warn(warning);
}

// A read pointing at a metric that doesn't exist would otherwise ship a number with no definition
// attached — silently, since the rows still render. Caught at boot, where a typo is cheap to fix.
function warnAboutMetricRefs(): void {
  const warning = formatMetricProblems(listBakedQueries());
  if (warning !== null) console.warn(warning);
}

function publishBootEvent(): void {
  if (!synapse) {
    console.error(`[synapse] ${synapseConfigError}`);
    return;
  }
  void synapse
    .publishEvent('app_booted', { startedAt: new Date().toISOString() })
    .then((result) => {
      console.log(formatBootLog('app_booted', result));
    })
    .catch((err: unknown) => {
      console.error('[synapse] publish failed:', err instanceof Error ? err.message : err);
    });
}

function installShutdown(server: Server): void {
  const shutdown = (signal: string): void => {
    console.log(`[synapse-starter] ${signal} received — shutting down`);
    synapse?.close();
    server.close(() => process.exit(0));
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

async function main(): Promise<void> {
  const server = await createServerInstance();
  server.listen(port, host, () => {
    console.log(
      `[synapse-starter] listening on http://${host}:${port} (${isDev ? 'dev' : 'production'})`,
    );
    warnAboutCostlyReads();
    warnAboutMetricRefs();
    publishBootEvent();
  });
  installShutdown(server);
}

// Start the server unless we're under Vitest, which imports buildApp directly and must not have the
// module bind a port or publish a boot event as a side effect of the import.
if (!process.env.VITEST) {
  void main();
}
