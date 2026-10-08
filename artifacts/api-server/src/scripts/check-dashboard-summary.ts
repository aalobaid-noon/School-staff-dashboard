import assert from "node:assert/strict";
import express from "express";
import { pool } from "@workspace/db";
import dashboardRouter from "../routes/dashboard";
import dashboardAuthRouter from "../routes/dashboard-auth";
import { dashboardCookies } from "../lib/dashboard-cookies";

export async function checkDashboardSummary() {
  const previousQuery = pool.query;
  const previousConnect = pool.connect;
  const settings = { SYNAPSE_APP_ID: "fixture", SYNAPSE_APP_SECRET: "fixture",
    SYNAPSE_BASE_URL: "https://citadel.example.invalid", SESSION_SECRET: "fixture",
    DASHBOARD_OAUTH_REDIRECT_URI: "https://dashboard.example.invalid/oauth/callback" };
  const previousSettings = Object.fromEntries(Object.keys(settings).map((key) => [key, process.env[key]]));
  Object.assign(process.env, settings);
  let role: string | null = "FACILITATOR";
  const document = { meta: { window_start: "2026-08-23", window_end: "2026-10-07" },
    campuses: [{ id: 1, mgr: "7", enr: 50 }, { id: 2, mgr: "8", enr: 70 }],
    facilitators: [{ cid: 1, fid: 7, n: 10, act: 8 }, { cid: 1, fid: 8, n: 40, act: 35 },
      { cid: 2, fid: 9, n: 70, act: 60 }],
    leads: [{ lid: 7, cid: 1 }, { lid: 8, cid: 1 }, { lid: 9, cid: 2 }], managers: [{ id: 7 }, { id: 8 }] };
  pool.query = (async () => ({ rows: [{ document, synced_at: new Date("2026-10-07") }] })) as unknown as typeof pool.query;
  pool.connect = (async () => ({ release() {}, query: async (sql: string) => ({ rows: sql.startsWith("SELECT")
    ? [{ email: "employee@noonacademy.com", profile_id: "7", user_type: role,
      access_expires_at: new Date(Date.now() + 3600000), expires_at: new Date(Date.now() + 3600000) }] : [] })
  })) as unknown as typeof pool.connect;
  const app = express();
  app.use((req, _res, next) => { req.log = { error() {} } as unknown as typeof req.log; next(); });
  app.use(dashboardRouter);
  app.use(dashboardAuthRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    const address = server.address();
    assert(address && typeof address !== "string");
    const url = `http://127.0.0.1:${address.port}/dashboard/summary`;
    for (const [userType, expected] of [
      ["ADMIN", { schools: 2, enrolledStudents: 120, managers: 2, schoolLeads: 3, facilitators: 3 }],
      ["SCHOOL_MANAGER", { schools: 1, enrolledStudents: 50, managers: 1, schoolLeads: 2, facilitators: 2 }],
      ["SCHOOL_LEAD", { schools: 1, enrolledStudents: 50, managers: 0, schoolLeads: 1, facilitators: 2 }],
      ["FACILITATOR", { schools: 1, enrolledStudents: 10, managers: 0, schoolLeads: 0, facilitators: 1 }],
      [null, null], ["TEACHER", null],
    ] as const) {
      role = userType;
      const response = await fetch(url, { headers: {
        Cookie: `${dashboardCookies(process.env.NODE_ENV === "development").sessionName}=${"a".repeat(64)}`,
      } });
      const body = await response.json() as { metrics: unknown };
      assert.equal(response.status, 200);
      if (!expected) {
        assert.equal((body as { authRequired?: boolean }).authRequired, true);
        assert.equal(body.metrics, null);
        continue;
      }
      if (expected) assert.deepEqual(body.metrics, expected);
      else assert.equal(body.metrics, undefined);
    }
    const anonymous = await fetch(url);
    const body = await anonymous.json() as { authRequired: boolean; metrics: unknown };
    assert.equal(body.authRequired, true);
    assert.equal(body.metrics, null);
    const login = await fetch(url.replace("/summary", "/login"));
    assert.equal(login.status, 200);
    assert((await login.text()).includes("Choose your school report profile"));
    assert(login.headers.get("set-cookie")?.includes("Expires="));
    for (const role of ["ADMIN", "SCHOOL_MANAGER", "SCHOOL_LEAD", "FACILITATOR"]) {
      const redirect = await fetch(url.replace("/summary", "/login") + `?userType=${role}`, { redirect: "manual" });
      assert.equal(redirect.status, 302);
      assert.equal(new URL(redirect.headers.get("location")!).searchParams.get("userType"), role);
    }
    assert.equal((await fetch(url.replace("/summary", "/login?userType=STUDENT"))).status, 400);
    console.log("Summary HTTP endpoint enforces all four role scopes and denies unknown roles: PASS");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    pool.query = previousQuery;
    pool.connect = previousConnect;
    for (const [key, value] of Object.entries(previousSettings)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}
