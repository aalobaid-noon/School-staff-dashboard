import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { getDashboardUser } from "./dashboard-auth";
import { SEED_ADMIN_PROFILE_IDS, currentAdminIds, loadOverrides, resolveAdmin, type Queryable } from "../lib/admin-access";

// The report is older than this when it is flagged as stale. Syncs are started by hand, so this
// is a prompt to run one, not an error.
const STALE_AFTER_HOURS = 48;

type DashboardUser = NonNullable<Awaited<ReturnType<typeof getDashboardUser>>>;

// State-changing requests must carry a custom header and come from this app's own origin.
export function originAllowed(req: Pick<Request, "headers" | "get">, header: string) {
  if (req.get(header) !== "1") return false;
  const allowed = [
    process.env.DASHBOARD_OAUTH_REDIRECT_URI,
    process.env.NODE_ENV === "development" && process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}` : undefined,
  ].filter((url): url is string => !!url).map((url) => new URL(url).origin);
  return typeof req.headers.origin === "string" && allowed.includes(req.headers.origin);
}
export const adminOriginAllowed = (req: Pick<Request, "headers" | "get">) => originAllowed(req, "X-Dashboard-Admin");

export function parseAdminToggle(profileId: unknown, body: unknown): { profileId: number; isAdmin: boolean } | null {
  const id = typeof profileId === "string" && /^\d{1,12}$/.test(profileId) ? Number(profileId) : NaN;
  const isAdmin = body && typeof body === "object" ? (body as { isAdmin?: unknown }).isAdmin : undefined;
  if (!Number.isSafeInteger(id) || id <= 0 || typeof isAdmin !== "boolean") return null;
  return { profileId: id, isAdmin };
}

export type AdminToggleResult = { ok: true } | { ok: false; status: number; error: string };

// Pure decision so the safety rules are testable without a database: nobody changes their own
// access, and the last admin cannot be removed.
export function checkAdminToggle(actorId: number, target: { profileId: number; isAdmin: boolean }, admins: Set<number>): AdminToggleResult {
  if (target.profileId === actorId) return { ok: false, status: 409, error: "You cannot change your own access. Ask another admin." };
  if (!target.isAdmin && admins.has(target.profileId) && admins.size <= 1) {
    return { ok: false, status: 409, error: "At least one admin must remain." };
  }
  return { ok: true };
}

export function createDashboardAdminRouter(dependencies: {
  database?: Queryable & { connect?: typeof pool.connect }; authenticate?: typeof getDashboardUser;
} = {}) {
  const database = dependencies.database ?? pool;
  const authenticate = dependencies.authenticate ?? getDashboardUser;
  const router: IRouter = Router();

  async function requireAdmin(req: Request, res: Response): Promise<DashboardUser | null> {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const user = await authenticate(req);
    if (!user) { res.status(401).json({ error: "Sign in with Noon first." }); return null; }
    if (user.userType !== "ADMIN") { res.status(403).json({ error: "Admins only." }); return null; }
    return user;
  }

  router.get("/dashboard/admin/overview", async (req, res): Promise<void> => {
    try {
      const admin = await requireAdmin(req, res);
      if (!admin) return;
      const day = "date_trunc('day', occurred_at AT TIME ZONE 'Asia/Riyadh')";
      const [snapshot, runs, totals, daily, byRole, recent, known, overrides] = await Promise.all([
        database.query<{ synced_at: Date; window_start: string; window_end: string }>(
          "SELECT synced_at, window_start, window_end FROM school_report_snapshots ORDER BY id DESC LIMIT 1"),
        database.query<{ id: string; state: string; next_step: number; window_end: string; error: string | null; started_at: Date; updated_at: Date }>(
          "SELECT id, state, next_step, window_end, error, started_at, updated_at FROM dashboard_sync_runs ORDER BY started_at DESC LIMIT 10"),
        database.query<{ logins_7d: string; users_7d: string; logins_30d: string; users_30d: string }>(
          "SELECT count(*) FILTER (WHERE occurred_at > now() - interval '7 days') AS logins_7d, " +
          "count(DISTINCT profile_id) FILTER (WHERE occurred_at > now() - interval '7 days') AS users_7d, " +
          "count(*) FILTER (WHERE occurred_at > now() - interval '30 days') AS logins_30d, " +
          "count(DISTINCT profile_id) FILTER (WHERE occurred_at > now() - interval '30 days') AS users_30d " +
          "FROM dashboard_login_events"),
        database.query<{ day: Date; logins: string; users: string }>(
          `SELECT ${day} AS day, count(*) AS logins, count(DISTINCT profile_id) AS users FROM dashboard_login_events ` +
          "WHERE occurred_at > now() - interval '14 days' GROUP BY 1 ORDER BY 1"),
        database.query<{ user_type: string | null; logins: string; users: string }>(
          "SELECT user_type, count(*) AS logins, count(DISTINCT profile_id) AS users FROM dashboard_login_events " +
          "WHERE occurred_at > now() - interval '30 days' GROUP BY 1 ORDER BY 2 DESC"),
        database.query<{ profile_id: string; user_type: string | null; occurred_at: Date; email: string | null }>(
          "SELECT e.profile_id, e.user_type, e.occurred_at, u.email FROM dashboard_login_events e " +
          "LEFT JOIN dashboard_users u USING (profile_id) ORDER BY e.occurred_at DESC LIMIT 20"),
        database.query<{ profile_id: string; email: string; last_user_type: string | null; first_seen_at: Date; last_seen_at: Date; login_count: number }>(
          "SELECT profile_id, email, last_user_type, first_seen_at, last_seen_at, login_count FROM dashboard_users"),
        loadOverrides(database),
      ]);

      const latest = snapshot.rows[0];
      const ageHours = latest ? (Date.now() - latest.synced_at.getTime()) / 3_600_000 : null;
      const lastRun = runs.rows[0];
      const seen = new Map(known.rows.map((row) => [Number(row.profile_id), row]));
      const ids = new Set<number>([...seen.keys(), ...SEED_ADMIN_PROFILE_IDS, ...overrides.keys()]);
      const users = [...ids].map((profileId) => {
        const row = seen.get(profileId);
        const access = resolveAdmin(profileId, overrides.get(profileId));
        return {
          profileId, email: row?.email ?? null, lastUserType: row?.last_user_type ?? null,
          isAdmin: access.isAdmin, adminSource: access.source,
          firstSeenAt: row?.first_seen_at.toISOString() ?? null, lastSeenAt: row?.last_seen_at.toISOString() ?? null,
          loginCount: row?.login_count ?? 0,
        };
      }).sort((a, b) => Number(b.isAdmin) - Number(a.isAdmin) ||
        (b.lastSeenAt ?? "").localeCompare(a.lastSeenAt ?? "") || a.profileId - b.profileId);

      res.json({
        viewer: { profileId: admin.profileId, email: admin.email },
        health: {
          snapshotAvailable: !!latest,
          syncedAt: latest?.synced_at.toISOString() ?? null,
          windowStart: latest?.window_start ?? null, windowEnd: latest?.window_end ?? null,
          ageHours: ageHours === null ? null : Math.round(ageHours * 10) / 10,
          staleAfterHours: STALE_AFTER_HOURS,
          status: !latest ? "no_data" : lastRun?.state === "failed" && lastRun.updated_at > latest.synced_at ? "last_sync_failed"
            : ageHours! > STALE_AFTER_HOURS ? "stale" : "fresh",
          runs: runs.rows.map((run) => ({
            id: run.id, state: run.state, completedSteps: run.next_step, windowEnd: run.window_end,
            error: run.error ? run.error.slice(0, 300) : null,
            startedAt: run.started_at.toISOString(), updatedAt: run.updated_at.toISOString(),
          })),
        },
        usage: {
          logins7d: Number(totals.rows[0]?.logins_7d ?? 0), users7d: Number(totals.rows[0]?.users_7d ?? 0),
          logins30d: Number(totals.rows[0]?.logins_30d ?? 0), users30d: Number(totals.rows[0]?.users_30d ?? 0),
          daily: daily.rows.map((row) => ({ day: row.day.toISOString().slice(0, 10), logins: Number(row.logins), users: Number(row.users) })),
          byRole: byRole.rows.map((row) => ({ userType: row.user_type ?? "UNKNOWN", logins: Number(row.logins), users: Number(row.users) })),
          recent: recent.rows.map((row) => ({
            profileId: Number(row.profile_id), email: row.email, userType: row.user_type, at: row.occurred_at.toISOString(),
          })),
        },
        users,
      });
    } catch {
      req.log.error("Admin overview is unavailable; no private data was logged");
      res.status(503).json({ error: "The admin overview is temporarily unavailable." });
    }
  });

  router.put("/dashboard/admin/users/:profileId", async (req, res): Promise<void> => {
    try {
      const admin = await requireAdmin(req, res);
      if (!admin) return;
      if (!adminOriginAllowed(req)) { res.status(403).json({ error: "Request origin was not accepted." }); return; }
      const target = parseAdminToggle(req.params.profileId, req.body);
      if (!target) { res.status(400).json({ error: "Send a numeric profile ID and { isAdmin: true | false }." }); return; }
      const decision = checkAdminToggle(admin.profileId, target, await currentAdminIds(database));
      if (!decision.ok) { res.status(decision.status).json({ error: decision.error }); return; }
      await database.query(
        "INSERT INTO dashboard_admin_overrides (profile_id, is_admin, updated_by) VALUES ($1, $2, $3) " +
        "ON CONFLICT (profile_id) DO UPDATE SET is_admin = EXCLUDED.is_admin, updated_by = EXCLUDED.updated_by, updated_at = now()",
        [target.profileId, target.isAdmin, admin.profileId],
      );
      req.log.info({ event: "dashboard_admin", actor: admin.profileId, target: target.profileId, isAdmin: target.isAdmin }, "Admin access changed");
      res.json({ profileId: target.profileId, isAdmin: target.isAdmin });
    } catch {
      req.log.error("Admin access change failed; no private data was logged");
      res.status(503).json({ error: "The change could not be saved. Please retry." });
    }
  });

  return router;
}

export default createDashboardAdminRouter();
