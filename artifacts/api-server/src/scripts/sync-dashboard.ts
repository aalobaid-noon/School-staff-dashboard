import { pool } from "@workspace/db";
import { assembleReport, fetchReportStep, reportJobs, reportTerm, reportToday, reportTotalSteps } from "../lib/report-import";

// Explicit CLI import: the same reads and validation as the authenticated production sync.
// Run it from a scheduled deployment (see docs/scheduled-sync.md), never from status polling or startup.
// Every run is recorded in dashboard_sync_runs, so scheduled runs and failures show up in the admin
// console next to manual ones. Errors are stored as a generic message; details are never logged.
let step = 0;
let runId: string | undefined;
const client = await pool.connect();
let locked = false;
try {
  locked = (await client.query("SELECT pg_try_advisory_lock(746213, 1) AS locked")).rows[0].locked;
  if (!locked) throw new Error("Another report import is active");
  const active = await client.query("SELECT 1 FROM dashboard_sync_runs WHERE state = 'running' LIMIT 1");
  if (active.rows.length) throw new Error("Resume the active report import through the dashboard");
  const today = reportToday();
  runId = (await client.query<{ id: string }>(
    "INSERT INTO dashboard_sync_runs (window_end) VALUES ($1) RETURNING id", [today])).rows[0].id;
  const raw: Record<string, unknown> = {};
  for (; step < reportJobs.length; step++) {
    console.log(`[report-sync] Reading step ${step + 1} of ${reportJobs.length}.`);
    Object.assign(raw, await fetchReportStep(step, today));
    await client.query("UPDATE dashboard_sync_runs SET next_step = $2, updated_at = now() WHERE id = $1", [runId, step + 1]);
  }
  const document = await assembleReport(raw, today);
  await client.query(
    "INSERT INTO school_report_snapshots (window_start, window_end, document) VALUES ($1,$2,$3::jsonb)",
    [reportTerm, today, JSON.stringify(document)],
  );
  await client.query(
    "UPDATE dashboard_sync_runs SET state = 'succeeded', next_step = $2, error = NULL, updated_at = now() WHERE id = $1",
    [runId, reportTotalSteps]);
  console.log("[report-sync] Complete validated snapshot saved privately.");
} catch {
  console.error(`[report-sync] Import failed at step ${step + 1}; no new snapshot published. Private errors were not logged.`);
  process.exitCode = 1;
  if (runId) {
    // Best effort: a failure to record the failure must not hide the original exit code.
    await client.query(
      "UPDATE dashboard_sync_runs SET state = 'failed', error = $2, updated_at = now() WHERE id = $1",
      [runId, `Scheduled import failed at step ${step + 1} of ${reportJobs.length}.`],
    ).catch(() => undefined);
  }
} finally {
  if (locked) await client.query("SELECT pg_advisory_unlock(746213, 1)");
  client.release();
  await pool.end();
}
