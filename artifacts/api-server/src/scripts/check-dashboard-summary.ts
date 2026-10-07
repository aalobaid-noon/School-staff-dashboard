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
    DASHBOARD_SCHOOL_STAFF_EMAILS: "staff.one@noonacademy.com,staff.two@noonacademy.com",
    SYNAPSE_BASE_URL: "https://citadel.example.invalid", SESSION_SECRET: "fixture",
    DASHBOARD_OAUTH_REDIRECT_URI: "https://dashboard.example.invalid/oauth/callback" };
  const previousSettings = Object.fromEntries(Object.keys(settings).map((key) => [key, process.env[key]]));
  Object.assign(process.env, settings);
  let role: string | null = "FACILITATOR";
  let email = "employee@noonacademy.com";
  let profileId = "7";
  const document = { meta: { window_start: "2026-08-23", window_end: "2026-10-07" },
    campuses: [{ id: 1, name: "Allowed School", mgr: "7", enr: 50 },
      { id: 2, name: "Other School", mgr: "8", enr: 70 }],
    facilitators: [{ cid: 1, fid: 7, n: 10, act: 8 }, { cid: 1, fid: 8, n: 40, act: 35 },
      { cid: 2, fid: 9, n: 70, act: 60 }],
    leads: [{ lid: 7, cid: 1 }, { lid: 8, cid: 1 }, { lid: 9, cid: 2 }], managers: [{ id: 7 }, { id: 8 }],
    students: [["Allowed Student", 1, 0, 0, 7], ["Other Student", 2, 0, 0, 9]],
    comments: [], grades: ["Fixture Grade"], cohorts: ["Fixture Cohort"] };
  pool.query = (async () => ({ rows: [{ document, synced_at: new Date("2026-10-07") }] })) as unknown as typeof pool.query;
  pool.connect = (async () => ({ release() {}, query: async (sql: string) => ({ rows: sql.startsWith("SELECT")
    ? [{ email, profile_id: profileId, user_type: role,
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
      assert.equal(response.status, expected ? 200 : 403);
      if (expected) assert.deepEqual(body.metrics, expected);
      else assert.equal(body.metrics, undefined);
    }
    const cookie = `${dashboardCookies(process.env.NODE_ENV === "development").sessionName}=${"a".repeat(64)}`;
    for (const staffEmail of ["staff.one@noonacademy.com", "staff.two@noonacademy.com"]) {
      email = staffEmail;
      role = "ADMIN";
      profileId = "7";
      const summary = await fetch(url, { headers: { Cookie: cookie } });
      assert.equal(summary.status, 200);
      assert.deepEqual((await summary.json() as { metrics: unknown }).metrics,
        { schools: 1, enrolledStudents: 50, managers: 1, schoolLeads: 2, facilitators: 2 });
      const report = await fetch(url.replace("/summary", "/report"), { headers: { Cookie: cookie } });
      assert.equal(report.status, 200);
      const html = await report.text();
      assert(html.includes("Allowed Student"));
      assert(!html.includes("Other Student"));
      assert(!html.includes("Other School"));
      profileId = "999";
      assert.equal((await fetch(url, { headers: { Cookie: cookie } })).status, 403);
      assert.equal((await fetch(url.replace("/summary", "/report"), { headers: { Cookie: cookie } })).status, 403);
    }
    email = "admin@example.invalid";
    profileId = "7";
    const adminReport = await fetch(url.replace("/summary", "/report"), { headers: { Cookie: cookie } });
    assert.equal(adminReport.status, 200);
    assert((await adminReport.text()).includes("Other Student"));
    const anonymous = await fetch(url);
    const body = await anonymous.json() as { authRequired: boolean; metrics: unknown };
    assert.equal(body.authRequired, true);
    assert.equal(body.metrics, null);
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
