import { Router, type IRouter, type Request } from "express";
import { pool } from "@workspace/db";
import { getDashboardUser, isDashboardOps } from "./dashboard-auth";
import { assembleReport, fetchReportStep, reportTerm, reportToday, reportTotalSteps } from "../lib/report-import";
import { AdvanceDashboardSyncBody } from "@workspace/api-zod";

type Run = { id: string; state: "running" | "succeeded" | "failed"; next_step: number;
  window_end: string; raw: Record<string, unknown>; error: string | null; updated_at: Date };
const publicRun = (run?: Run) => ({
  runId: run?.id ?? null, state: run?.state ?? "idle",
  completedSteps: run?.next_step ?? 0, totalSteps: reportTotalSteps, error: run?.error ?? null,
});
export function dashboardSyncOriginAllowed(req: Pick<Request, "headers" | "get">) {
  if (req.get("X-Dashboard-Sync") !== "1") return false;
  const allowed = [
    process.env.DASHBOARD_OAUTH_REDIRECT_URI,
    process.env.NODE_ENV === "development" && process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}` : undefined,
  ].filter((url): url is string => !!url).map((url) => new URL(url).origin);
  return typeof req.headers.origin === "string" && allowed.includes(req.headers.origin);
}

// Dependencies are explicit so import failures/access isolation can be tested
// without forged sessions, production writes, or real warehouse requests.
export function createDashboardSyncRouter(dependencies: {
  database?: typeof pool; authenticate?: typeof getDashboardUser;
  readStep?: typeof fetchReportStep; buildReport?: typeof assembleReport;
} = {}) {
const database = dependencies.database ?? pool;
const authenticate = dependencies.authenticate ?? getDashboardUser;
const readStep = dependencies.readStep ?? fetchReportStep;
const buildReport = dependencies.buildReport ?? assembleReport;
const router: IRouter = Router();
const connectDatabase = () => database.connect();
router.get("/dashboard/sync", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "private, no-store");
  try {
    const user = await authenticate(req);
    if (!user) { res.status(401).json({ error: "Sign in with Noon first." }); return; }
    const canSync = isDashboardOps(user);
    const snapshot = await database.query("SELECT synced_at FROM school_report_snapshots ORDER BY id DESC LIMIT 1");
    const run = await database.query<Run>(
      "SELECT id,state,next_step,error,updated_at FROM dashboard_sync_runs ORDER BY started_at DESC LIMIT 1",
    );
    res.json({
      ...publicRun(run.rows[0]), canSync,
      accessRole: canSync ? "central_operations" : "assigned_schools",
      roleLocked: true, snapshotAvailable: !!snapshot.rows.length,
      syncedAt: snapshot.rows[0]?.synced_at.toISOString() ?? null,
    });
  } catch {
    res.status(503).json({ error: "Sync status is unavailable. Please retry." });
  }
});

router.post(["/dashboard/sync", "/dashboard/sync/advance"], async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "private, no-store");
  let client: Awaited<ReturnType<typeof connectDatabase>> | undefined;
  let locked = false;
  let run: Run | undefined;
  let transaction = false;
  try {
    const user = await authenticate(req);
    if (!user) { res.status(401).json({ error: "Sign in with Noon first." }); return; }
    if (!isDashboardOps(user)) { res.status(403).json({ error: "Only approved central operations can sync report data." }); return; }
    if (!dashboardSyncOriginAllowed(req)) { res.status(403).json({ error: "Start the sync from this dashboard." }); return; }
    const advance = req.path.endsWith("/advance");
    const input = advance ? AdvanceDashboardSyncBody.safeParse(req.body) : null;
    if (input && !input.success) { res.status(400).json({ error: "Invalid sync identifier." }); return; }
    client = await connectDatabase();
    locked = (await client.query("SELECT pg_try_advisory_lock(746213, 1) AS locked")).rows[0].locked;
    if (!locked) { res.status(409).json({ error: "Another sync step is in progress. Please wait and resume." }); return; }
    if (!advance) {
      const active = await client.query<Run>("SELECT * FROM dashboard_sync_runs WHERE state = 'running' LIMIT 1");
      if (active.rows[0]) { res.json(publicRun(active.rows[0])); return; }
      const recent = await client.query(
        "SELECT 1 FROM dashboard_sync_runs WHERE updated_at > now() - interval '1 minute' LIMIT 1",
      );
      if (recent.rows.length) { res.status(429).json({ error: "Please wait one minute before starting another import." }); return; }
      const created = await client.query<Run>(
        "INSERT INTO dashboard_sync_runs (window_end) VALUES ($1) RETURNING *", [reportToday()],
      );
      res.json(publicRun(created.rows[0]));
      return;
    }
    const selected = await client.query<Run>("SELECT * FROM dashboard_sync_runs WHERE id = $1", [input!.data!.runId]);
    run = selected.rows[0];
    if (!run) { res.status(404).json({ error: "Sync not found." }); return; }
    if (run.state !== "running") { res.json(publicRun(run)); return; }
    if (run.next_step < reportTotalSteps - 1) {
      const extracted = await readStep(run.next_step, run.window_end);
      const saved = await client.query<Run>(
        "UPDATE dashboard_sync_runs SET raw = raw || $2::jsonb, next_step = next_step + 1, updated_at = now() " +
        "WHERE id = $1 RETURNING *", [run.id, JSON.stringify(extracted)],
      );
      res.json(publicRun(saved.rows[0]));
    } else {
      const document = await buildReport(run.raw, run.window_end);
      await client.query("BEGIN");
      transaction = true;
      await client.query(
        "INSERT INTO school_report_snapshots (window_start, window_end, document) VALUES ($1,$2,$3::jsonb)",
        [reportTerm, run.window_end, JSON.stringify(document)],
      );
      const saved = await client.query<Run>(
        "UPDATE dashboard_sync_runs SET state = 'succeeded', next_step = $2, raw = '{}'::jsonb, " +
        "updated_at = now(), error = null WHERE id = $1 RETURNING *", [run.id, reportTotalSteps],
      );
      await client.query("COMMIT");
      transaction = false;
      res.json(publicRun(saved.rows[0]));
    }
  } catch {
    if (client && transaction) await client.query("ROLLBACK").catch(() => {});
    if (client && run) {
      await client.query(
        "UPDATE dashboard_sync_runs SET state = 'failed', raw = '{}'::jsonb, error = $2, updated_at = now() " +
        "WHERE id = $1 AND state = 'running'",
        [run.id, `Import failed at step ${run.next_step + 1}. No new report was published; any previous report remains available.`],
      ).catch(() => {});
    }
    req.log.warn("Report import failed; no private query, records, or credentials were logged");
    res.status(503).json({ error: "Report import failed. Check sync status and try again; any previous report is unchanged." });
  } finally {
    if (client) {
      let destroy = false;
      if (locked) {
        try { await client.query("SELECT pg_advisory_unlock(746213, 1)"); } catch { destroy = true; }
      }
      client.release(destroy);
    }
  }
});

return router;
}
export default createDashboardSyncRouter();
