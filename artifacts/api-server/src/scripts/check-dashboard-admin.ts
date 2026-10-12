import assert from "node:assert/strict";
import express from "express";
import { SEED_ADMIN_PROFILE_IDS, currentAdminIds, effectiveUserType, resolveAdmin } from "../lib/admin-access";
import { checkAdminToggle, createDashboardAdminRouter, parseAdminToggle } from "../routes/dashboard-admin";

// In-memory stand-in for the three admin tables and the report tables. No real data is used.
export async function checkDashboardAdmin() {
  assert.equal(SEED_ADMIN_PROFILE_IDS.length, 30);
  assert.equal(new Set(SEED_ADMIN_PROFILE_IDS).size, 30);
  for (const id of [674492, 800302, 48392]) assert(SEED_ADMIN_PROFILE_IDS.includes(id));

  // Seed list decides by default; an override always wins in both directions.
  assert.deepEqual(resolveAdmin(48392, undefined), { isAdmin: true, source: "seed" });
  assert.deepEqual(resolveAdmin(999, undefined), { isAdmin: false, source: "seed" });
  assert.deepEqual(resolveAdmin(999, true), { isAdmin: true, source: "override" });
  assert.deepEqual(resolveAdmin(48392, false), { isAdmin: false, source: "override" });

  // A Citadel ADMIN that is not on the list loses admin; promoted users get the full report.
  assert.equal(effectiveUserType("ADMIN", false), null);
  assert.equal(effectiveUserType("ADMIN", true), "ADMIN");
  assert.equal(effectiveUserType("SCHOOL_MANAGER", true), "ADMIN");
  assert.equal(effectiveUserType("SCHOOL_MANAGER", false), "SCHOOL_MANAGER");

  assert.deepEqual(parseAdminToggle("123", { isAdmin: true }), { profileId: 123, isAdmin: true });
  for (const bad of [["abc", { isAdmin: true }], ["0", { isAdmin: true }], ["12", { isAdmin: "yes" }], ["12", null], ["-5", { isAdmin: false }]] as const) {
    assert.equal(parseAdminToggle(bad[0], bad[1]), null);
  }

  assert.equal(checkAdminToggle(1, { profileId: 1, isAdmin: false }, new Set([1, 2])).ok, false);
  assert.equal(checkAdminToggle(1, { profileId: 2, isAdmin: false }, new Set([2])).ok, false);
  assert.equal(checkAdminToggle(1, { profileId: 2, isAdmin: false }, new Set([1, 2])).ok, true);
  assert.equal(checkAdminToggle(1, { profileId: 9, isAdmin: true }, new Set([1])).ok, true);

  const overrides = new Map<number, boolean>();
  const query = async (sql: string, values: unknown[] = []): Promise<{ rows: any[] }> => {
    if (sql.includes("FROM dashboard_admin_overrides") && sql.startsWith("SELECT profile_id")) {
      return { rows: [...overrides].map(([profile_id, is_admin]) => ({ profile_id: String(profile_id), is_admin })) };
    }
    if (sql.startsWith("INSERT INTO dashboard_admin_overrides")) { overrides.set(Number(values[0]), Boolean(values[1])); return { rows: [] }; }
    if (sql.includes("FROM school_report_snapshots")) return { rows: [{ synced_at: new Date(), window_start: "2026-08-23", window_end: "2026-10-12" }] };
    if (sql.includes("FROM dashboard_sync_runs")) return { rows: [] };
    if (sql.includes("FROM dashboard_login_events") && sql.includes("count(*) FILTER")) {
      return { rows: [{ logins_7d: "3", users_7d: "2", logins_30d: "5", users_30d: "4" }] };
    }
    if (sql.includes("FROM dashboard_login_events")) return { rows: [] };
    if (sql.includes("FROM dashboard_users")) return { rows: [] };
    throw new Error("Unexpected test SQL");
  };
  assert.equal((await currentAdminIds({ query })).size, 30);
  overrides.set(48392, false);
  overrides.set(5, true);
  const admins = await currentAdminIds({ query });
  assert(!admins.has(48392) && admins.has(5) && admins.size === 30);
  overrides.clear();

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.log = { info() {}, warn() {}, error() {} } as unknown as typeof req.log; next(); });
  app.use(createDashboardAdminRouter({
    database: { query },
    authenticate: async (req) => {
      const who = req.get("X-Test-Account");
      return who === "admin" ? { email: "admin@example.invalid", profileId: 800302, userType: "ADMIN" }
        : who === "manager" ? { email: "manager@example.invalid", profileId: 2, userType: "SCHOOL_MANAGER" }
        : who === "revoked" ? { email: "revoked@example.invalid", profileId: 3, userType: null } : null;
    },
  }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/dashboard/admin`;
  const oldRedirect = process.env.DASHBOARD_OAUTH_REDIRECT_URI;
  process.env.DASHBOARD_OAUTH_REDIRECT_URI = "https://dashboard.example.invalid/oauth/callback";
  const call = (path: string, account: string, init: RequestInit = {}, origin = "https://dashboard.example.invalid") =>
    fetch(base + path, { ...init, headers: { "X-Test-Account": account, "X-Dashboard-Admin": "1", Origin: origin, "Content-Type": "application/json" } });
  try {
    assert.equal((await call("/overview", "")).status, 401);
    assert.equal((await call("/overview", "manager")).status, 403);
    assert.equal((await call("/overview", "revoked")).status, 403);
    const overview = await (await call("/overview", "admin")).json() as { health: { status: string }; users: { profileId: number; isAdmin: boolean }[]; usage: { logins7d: number } };
    assert.equal(overview.health.status, "fresh");
    assert.equal(overview.usage.logins7d, 3);
    assert.equal(overview.users.length, 30);
    assert(overview.users.every((user) => user.isAdmin));

    const put = (id: string, account: string, body: unknown, origin?: string) =>
      call("/users/" + id, account, { method: "PUT", body: JSON.stringify(body) }, origin);
    assert.equal((await put("5", "", { isAdmin: true })).status, 401);
    assert.equal((await put("5", "manager", { isAdmin: true })).status, 403);
    assert.equal((await put("5", "admin", { isAdmin: true }, "https://evil.example.invalid")).status, 403);
    assert.equal((await put("5", "admin", { isAdmin: "yes" })).status, 400);
    assert.equal((await put("800302", "admin", { isAdmin: false })).status, 409);
    assert.equal((await put("5", "admin", { isAdmin: true })).status, 200);
    assert.equal(overrides.get(5), true);
    assert.equal((await put("48392", "admin", { isAdmin: false })).status, 200);
    assert.equal(overrides.get(48392), false);
    const after = await (await call("/overview", "admin")).json() as { users: { profileId: number; isAdmin: boolean }[] };
    assert.equal(after.users.find((user) => user.profileId === 48392)?.isAdmin, false);
    assert.equal(after.users.find((user) => user.profileId === 5)?.isAdmin, true);
  } finally {
    if (oldRedirect === undefined) delete process.env.DASHBOARD_OAUTH_REDIRECT_URI; else process.env.DASHBOARD_OAUTH_REDIRECT_URI = oldRedirect;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  console.log("Admin console access: PASS");
}
