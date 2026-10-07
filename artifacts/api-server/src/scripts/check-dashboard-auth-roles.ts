import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { pool } from "@workspace/db";
import { dashboardOAuthCallback, getDashboardUser, getDashboardScope } from "../routes/dashboard-auth";
import { dashboardCookies } from "../lib/dashboard-cookies";

// Exercise the actual OAuth callback and session reader without connecting to
// Citadel, writing real sessions, or logging any credentials/private records.
export async function checkDashboardAuthRoles() {
  const originalFetch = globalThis.fetch;
  const originalQuery = pool.query;
  const originalConnect = pool.connect;
  const fixtureEnv = {
    SYNAPSE_APP_ID: "role-test-app",
    SYNAPSE_APP_SECRET: "synthetic-role-test-secret",
    SYNAPSE_BASE_URL: "https://citadel.example.invalid",
    SESSION_SECRET: "synthetic-role-test-session-secret",
    DASHBOARD_OAUTH_REDIRECT_URI: "https://dashboard.example.invalid/oauth/callback",
    DASHBOARD_OPS_EMAILS: "",
  };
  const oldEnv = Object.fromEntries(Object.keys(fixtureEnv).map((name) => [name, process.env[name]]));
  Object.assign(process.env, fixtureEnv);
  const cookies = dashboardCookies(process.env.NODE_ENV === "development");
  const state = "a".repeat(64);
  type Stored = { email: string; profile_id: string; user_type: string | null;
    refresh_token: string; access_expires_at: Date; expires_at: Date };
  let stored: Stored | undefined;
  let upstreamRole: string | undefined;
  const databaseQuery = async (sql: string, values: unknown[] = []) => {
    if (sql.startsWith("SELECT 1 FROM school_report_snapshots")) return { rows: [] };
    if (sql.startsWith("INSERT INTO dashboard_sessions")) {
      assert(sql.includes("user_type"));
      stored = {
        email: String(values[1]), profile_id: String(values[2]),
        user_type: values[3] as string | null, refresh_token: String(values[4]),
        access_expires_at: values[5] as Date, expires_at: values[6] as Date,
      };
      return { rows: [] };
    }
    if (sql.startsWith("SELECT email, profile_id")) {
      assert(sql.includes("user_type"));
      return { rows: stored ? [stored] : [] };
    }
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) return { rows: [] };
    throw new Error("Unexpected authentication test SQL");
  };
  pool.query = databaseQuery as unknown as typeof pool.query;
  pool.connect = (async () => ({ query: databaseQuery, release() {} })) as unknown as typeof pool.connect;
  globalThis.fetch = (async (input: string | URL | Request) => {
    assert.equal(new URL(String(input)).hostname, "citadel.example.invalid");
    return new globalThis.Response(JSON.stringify({
      token: { accessToken: "synthetic-access", refreshToken: "synthetic-refresh", expiresIn: 3600 },
      profile: { id: 999, userType: upstreamRole, account: { email: "role-fixture@noonacademy.com" } },
    }), { headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    for (const role of ["ADMIN", "SCHOOL_MANAGER", undefined]) {
      upstreamRole = role;
      stored = undefined;
      let opaqueSession = "";
      let redirect = "";
      let status = 200;
      const request = {
        headers: { cookie: `${cookies.stateName}=${state}`, "x-role": "ADMIN" },
        query: { state, code: "synthetic-code", userType: "ADMIN" },
        body: { userType: "ADMIN", role: "admin" },
        log: { warn() {} },
      } as unknown as Request;
      const response = {
        clearCookie() {},
        cookie(name: string, value: string) { if (name === cookies.sessionName) opaqueSession = value; },
        setHeader() {},
        redirect(_status: number, path: string) { redirect = path; },
        status(code: number) { status = code; return this; },
        send() {},
      } as unknown as Response;
      await dashboardOAuthCallback(request, response);
      assert.equal(status, 200);
      assert.equal(redirect, "/");
      assert.equal(opaqueSession.length, 64);
      assert(stored);
      assert.equal((stored as Stored).user_type, role ?? null);
      const sessionUser = await getDashboardUser({
        headers: { cookie: `${cookies.sessionName}=${opaqueSession}`, "x-role": "ADMIN" },
        query: { userType: "ADMIN" },
      } as unknown as Request);
      assert(sessionUser);
      assert.equal(sessionUser.userType, role ?? null);
      const scope = getDashboardScope(sessionUser, { campuses: [{ id: 101, mgr: "7" }, { id: 202, mgr: "8" }] });
      assert.equal(scope.isOps, role === "ADMIN");
      assert.equal(scope.campuses.length, role === "ADMIN" ? 2 : 0);
    }
    console.log("Verified OAuth roles persisted/read; browser role forgery denied; missing roles fail closed: PASS");
  } finally {
    globalThis.fetch = originalFetch;
    pool.query = originalQuery;
    pool.connect = originalConnect;
    for (const [name, value] of Object.entries(oldEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}
