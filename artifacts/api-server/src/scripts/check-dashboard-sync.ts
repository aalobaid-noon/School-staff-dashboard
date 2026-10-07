import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import { createDashboardSyncRouter } from "../routes/dashboard-sync";
import { pool } from "@workspace/db";

// An isolated in-memory SQL adapter: no real sessions, snapshots, or warehouse
// data are created. Production never receives these authentication fixtures.
export async function checkDashboardSyncRoutes() {
  type Run = { id: string; state: string; next_step: number; window_end: string;
    raw: Record<string, unknown>; error: string | null; updated_at: Date };
  const runs: Run[] = [];
  const snapshots: unknown[] = [];
  let locked = false;
  let readCalls = 0;
  let failRead = false;
  let failValidation = false;
  async function query(sql: string, values: unknown[] = []): Promise<{ rows: unknown[] }> {
    const latest = runs.at(-1);
    const byId = runs.find((run) => run.id === values[0]);
    if (sql.includes("pg_try_advisory_lock")) {
      const acquired = !locked; locked = true; return { rows: [{ locked: acquired }] };
    }
    if (sql.includes("pg_advisory_unlock")) { locked = false; return { rows: [] }; }
    if (sql.includes("SELECT synced_at")) return { rows: snapshots.length ? [{ synced_at: new Date() }] : [] };
    if (sql.startsWith("SELECT *") && sql.includes("state = 'running'")) return { rows: runs.filter((run) => run.state === "running") };
    if (sql.startsWith("SELECT *") && sql.includes("WHERE id")) return { rows: byId ? [byId] : [] };
    if (sql.includes("SELECT id,state")) return { rows: latest ? [latest] : [] };
    if (sql.includes("interval '1 minute'")) return { rows: latest && latest.updated_at.getTime() > Date.now() - 60_000 ? [{}] : [] };
    if (sql.startsWith("INSERT INTO dashboard_sync_runs")) {
      const run: Run = { id: randomUUID(), state: "running", next_step: 0, window_end: String(values[0]),
        raw: {}, error: null, updated_at: new Date() };
      runs.push(run); return { rows: [run] };
    }
    if (sql.startsWith("UPDATE dashboard_sync_runs") && byId) {
      if (sql.includes("raw = raw ||")) { Object.assign(byId.raw, JSON.parse(String(values[1]))); byId.next_step++; }
      else if (sql.includes("state = 'succeeded'")) { byId.state = "succeeded"; byId.next_step = Number(values[1]); byId.raw = {}; }
      else { byId.state = "failed"; byId.error = String(values[1]); byId.raw = {}; }
      byId.updated_at = new Date(); return { rows: [byId] };
    }
    if (sql.startsWith("INSERT INTO school_report_snapshots")) { snapshots.push(JSON.parse(String(values[2]))); return { rows: [] }; }
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) return { rows: [] };
    throw new Error("Unexpected test SQL");
  }
  const database = { query, connect: async () => ({ query, release() {} }) } as unknown as typeof pool;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.log = { warn() {} } as unknown as typeof req.log; next(); });
  app.use(createDashboardSyncRouter({
    database,
    authenticate: async (req) => req.get("X-Test-Account") === "ops"
      ? { email: "ops@example.invalid", profileId: 1, userType: null }
      : req.get("X-Test-Account") === "admin" ? { email: "admin@example.invalid", profileId: 3, userType: "ADMIN" }
      : req.get("X-Test-Account") === "manager" ? { email: "manager@example.invalid", profileId: 2, userType: "SCHOOL_MANAGER" } : null,
    readStep: async () => { readCalls++; if (failRead) throw new Error("private upstream details"); return { privateRow: "fixture" }; },
    buildReport: async () => { if (failValidation) throw new Error("invalid extract"); return { campuses: [{ id: 1 }], meta: {} }; },
  }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const oldOps = process.env.DASHBOARD_OPS_EMAILS;
  const oldRedirect = process.env.DASHBOARD_OAUTH_REDIRECT_URI;
  process.env.DASHBOARD_OPS_EMAILS = "ops@example.invalid";
  process.env.DASHBOARD_OAUTH_REDIRECT_URI = "https://dashboard.example.invalid/oauth/callback";
  async function call(path: string, method = "GET", account = "", body?: unknown, origin = "https://dashboard.example.invalid") {
    const response = await fetch(base + "/dashboard/sync" + path, { method,
      headers: { "X-Test-Account": account, "X-Dashboard-Sync": "1", Origin: origin, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json() as {
      runId: string; state: string; completedSteps: number;
      canSync: boolean; roleLocked: boolean; accessRole: string; snapshotAvailable: boolean;
    };
    return { status: response.status, data };
  }
  try {
    assert.equal((await call("")).status, 401);
    assert.equal((await call("", "POST")).status, 401);
    const manager = await call("", "GET", "manager");
    assert.equal(manager.data.canSync, false);
    assert.equal(manager.data.roleLocked, true);
    assert.equal((await call("", "POST", "manager", { role: "central_operations" })).status, 403);
    assert.equal((await call("", "POST", "manager", { userType: "ADMIN" })).status, 403);
    const admin = await call("", "GET", "admin");
    assert.equal(admin.data.canSync, true);
    assert.equal(admin.data.accessRole, "admin");
    assert.equal(admin.data.roleLocked, true);
    assert.equal((await call("", "POST", "ops", {}, "https://attacker.example.invalid")).status, 403);
    assert.equal((await call("", "POST", "admin", {}, "https://attacker.example.invalid")).status, 403);
    const adminStart = await call("", "POST", "admin");
    assert.equal(adminStart.status, 200);
    let run = adminStart.data;
    assert.equal(readCalls, 0, "Starting/status checks must not read the warehouse");
    assert.equal((await call("/advance", "POST", "ops", { runId: "invalid" })).status, 400);
    run = (await call("/advance", "POST", "ops", { runId: run.runId })).data;
    assert.equal(run.completedSteps, 1);
    assert.equal(snapshots.length, 0, "Incomplete imports cannot publish reports");
    const status = (await call("", "GET", "ops")).data;
    assert.equal(status.completedSteps, 1, "Progress survives browser interruption");
    assert.equal("raw" in status, false);
    assert.equal(status.accessRole, "central_operations");
    locked = true;
    assert.equal((await call("/advance", "POST", "ops", { runId: run.runId })).status, 409);
    locked = false;
    failRead = true;
    assert.equal((await call("/advance", "POST", "ops", { runId: run.runId })).status, 503);
    assert.equal(runs.at(-1)?.state, "failed");
    assert.equal(snapshots.length, 0);
    assert.equal((await call("", "POST", "ops")).status, 429);
    failRead = false;
    runs.at(-1)!.updated_at = new Date(0);
    run = (await call("", "POST", "ops")).data;
    for (let i = 0; i < 8; i++) {
      const result = await call("/advance", "POST", "ops", { runId: run.runId });
      assert.equal(result.status, 200); run = result.data;
      if (i < 7) assert.equal(snapshots.length, 0);
    }
    assert.equal(run.state, "succeeded");
    assert.equal(snapshots.length, 1);
    assert.deepEqual(runs.at(-1)!.raw, {}, "Temporary extracts are removed after publication");
    assert.equal((await call("/advance", "POST", "ops", { runId: run.runId })).data.state, "succeeded");
    assert.equal(snapshots.length, 1, "A retried completed step must not publish twice");
    runs.at(-1)!.updated_at = new Date(0);
    run = (await call("", "POST", "ops")).data;
    for (let i = 0; i < 7; i++) await call("/advance", "POST", "ops", { runId: run.runId });
    failValidation = true;
    assert.equal((await call("/advance", "POST", "ops", { runId: run.runId })).status, 503);
    assert.equal(snapshots.length, 1, "Validation failure preserves the previous report");
    assert.equal((await call("", "GET", "manager")).data.snapshotAvailable, true);
    console.log("Dashboard sync: authentication, locked access, CSRF, resumability, concurrency, validation and publication: PASS");
  } finally {
    if (oldOps === undefined) delete process.env.DASHBOARD_OPS_EMAILS; else process.env.DASHBOARD_OPS_EMAILS = oldOps;
    if (oldRedirect === undefined) delete process.env.DASHBOARD_OAUTH_REDIRECT_URI; else process.env.DASHBOARD_OAUTH_REDIRECT_URI = oldRedirect;
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}
