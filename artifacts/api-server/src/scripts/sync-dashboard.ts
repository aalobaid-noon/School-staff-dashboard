import { pool } from "@workspace/db";
import { assembleReport, fetchReportStep, reportJobs, reportTerm, reportToday } from "../lib/report-import";

// Explicit CLI imports use exactly the same seven reads and validation as the
// authenticated production sync. Never run this from status polling or startup.
let step = 0;
const client = await pool.connect();
let locked = false;
try {
  locked = (await client.query("SELECT pg_try_advisory_lock(746213, 1) AS locked")).rows[0].locked;
  if (!locked) throw new Error("Another report import is active");
  const active = await client.query("SELECT 1 FROM dashboard_sync_runs WHERE state = 'running' LIMIT 1");
  if (active.rows.length) throw new Error("Resume the active report import through the dashboard");
  const today = reportToday();
  const raw: Record<string, unknown> = {};
  for (; step < reportJobs.length; step++) {
    console.log(`[report-sync] Reading step ${step + 1} of ${reportJobs.length}.`);
    Object.assign(raw, await fetchReportStep(step, today));
  }
  const document = await assembleReport(raw, today);
  await client.query(
    "INSERT INTO school_report_snapshots (window_start, window_end, document) VALUES ($1,$2,$3::jsonb)",
    [reportTerm, today, JSON.stringify(document)],
  );
  console.log("[report-sync] Complete validated snapshot saved privately.");
} catch {
  console.error(`[report-sync] Import failed at step ${step + 1}; no new snapshot published. Private errors were not logged.`);
  process.exitCode = 1;
} finally {
  if (locked) await client.query("SELECT pg_advisory_unlock(746213, 1)");
  client.release();
  await pool.end();
}
