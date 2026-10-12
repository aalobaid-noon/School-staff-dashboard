import assert from "node:assert/strict";
import express from "express";
import { pool } from "@workspace/db";
import dashboardRouter, { dashboardOAuthCallback } from "../routes/dashboard-auth";
import { dashboardCookies } from "../lib/dashboard-cookies";

export async function checkDashboardLogin() {
  const settings = {
    SYNAPSE_APP_ID: "login-fixture",
    SYNAPSE_APP_SECRET: "synthetic-app-secret",
    SYNAPSE_BASE_URL: "https://citadel.example.invalid",
    SESSION_SECRET: "synthetic-session-secret",
    DASHBOARD_OAUTH_REDIRECT_URI: "https://dashboard.example.invalid/oauth/callback",
  };
  const previousSettings = Object.fromEntries(Object.keys(settings).map((name) => [name, process.env[name]]));
  Object.assign(process.env, settings);
  const previousQuery = pool.query;
  let databaseCalls = 0;
  pool.query = (async () => { databaseCalls++; throw new Error("Unexpected database call"); }) as typeof pool.query;
  const events: object[] = [];
  const app = express();
  app.use((req, _res, next) => {
    req.log = { info(event: object) { events.push(event); }, warn(event: object) { events.push(event); } } as typeof req.log;
    next();
  });
  app.use("/api", dashboardRouter);
  app.get("/oauth/callback", dashboardOAuthCallback);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    const address = server.address();
    assert(address && typeof address !== "string");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const login = await fetch(`${baseUrl}/api/dashboard/login?start=1`, { redirect: "manual" });
    assert.equal(login.status, 302);
    const authorization = new URL(login.headers.get("location")!);
    assert.equal(authorization.origin, settings.SYNAPSE_BASE_URL);
    assert.equal(authorization.searchParams.get("userType"), null);
    const state = authorization.searchParams.get("state")!;
    const correlationId = login.headers.get("x-dashboard-auth-id");
    assert.match(state, /^[a-f0-9]{64}$/);
    assert(correlationId && !state.includes(correlationId));
    const cookies = dashboardCookies(process.env.NODE_ENV === "development");
    const stateCookie = `${cookies.stateName}=${state}`;
    assert(login.headers.get("set-cookie")?.includes("SameSite=Lax"));
    const code = "synthetic-authorization-code-must-not-be-logged";
    for (const path of ["/oauth/callback", "/api/dashboard/oauth/callback"]) {
      for (const [query, cookie, destination, reason] of [
        [`state=${state}&code=${code}`, "", "document", "state_cookie_missing"],
        [`state=${state}&code=${code}`, `${cookies.stateName}=${"b".repeat(64)}`, "document", "state_mismatch"],
        [`state=${state}&code=${code}`, `${cookies.stateName}=malformed`, "document", "state_mismatch"],
        [`state=${state}&code=${code}`, stateCookie, "iframe", "embedded_callback"],
        [`state=${state}&code=`, stateCookie, "document", "invalid_callback_parameters"],
        [`state=${state}&code=x&code=y`, stateCookie, "document", "invalid_callback_parameters"],
        [`state=invalid&code=${code}`, stateCookie, "document", "invalid_callback_parameters"],
      ]) {
        const response = await fetch(`${baseUrl}${path}?${query}`, {
          headers: { cookie, "sec-fetch-dest": destination }, redirect: "manual",
        });
        assert.equal(response.status, 400);
        const body = await response.text();
        assert(body.includes('target="_blank"'));
        assert(body.includes("Reference:"));
        assert(!body.includes(state));
        assert(!body.includes(code));
        assert.equal((events.at(-1) as { reason: string }).reason, reason);
        if (query.startsWith(`state=${state}&`)) {
          assert.equal(response.headers.get("x-dashboard-auth-id"), correlationId);
        }
      }
    }
    assert.equal(databaseCalls, 0);
    const serializedEvents = JSON.stringify(events);
    for (const secret of [state, code, stateCookie, settings.SYNAPSE_APP_SECRET, settings.SESSION_SECRET]) {
      assert(!serializedEvents.includes(secret));
    }
    console.log("OAuth callback rejection reasons, correlation, and secret-free logs: PASS");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    pool.query = previousQuery;
    for (const [name, value] of Object.entries(previousSettings)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
}
