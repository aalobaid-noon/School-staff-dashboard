import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { getDashboardScope, getDashboardUser } from "./dashboard-auth";

const router: IRouter = Router();

// Only a verified Noon session gets numbers, scoped to the user's schools.
// An anonymous visitor can see snapshot readiness, never metrics or school records.
router.get("/dashboard/summary", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const user = await getDashboardUser(req);
    if (!user) {
      const ready = await pool.query<{ synced_at: Date }>(
        "SELECT synced_at FROM school_report_snapshots ORDER BY id DESC LIMIT 1",
      );
      res.json({
        available: false, authRequired: true,
        syncedAt: ready.rows[0]?.synced_at.toISOString() ?? null,
        windowStart: null, windowEnd: null, metrics: null,
      });
      return;
    }
    const result = await pool.query<{ document: unknown; synced_at: Date }>(
      "SELECT document, synced_at FROM school_report_snapshots ORDER BY id DESC LIMIT 1",
    );
    if (!result.rows.length) {
      res.json({ available: false, authRequired: false,
        syncedAt: null, windowStart: null, windowEnd: null, metrics: null });
      return;
    }
    const { document, synced_at } = result.rows[0];
    if (!document || typeof document !== "object") throw new Error("Invalid reporting document");
    const data = document as Record<string, unknown>;
    if (!Array.isArray(data.campuses) || !Array.isArray(data.leads) || !Array.isArray(data.facilitators) ||
        !Array.isArray(data.managers) || !data.meta || typeof data.meta !== "object") {
      throw new Error("Incomplete reporting document");
    }
    const { isOps, campuses: scoped } = getDashboardScope(user, data);
    if (!scoped.length) {
      res.status(403).json({ error: "No schools are assigned to this Noon account." });
      return;
    }
    const ids = new Set(scoped.map((campus) => String((campus as { id: number }).id)));
    const campuses = scoped as Array<{ enr: number }>;
    const leads = (data.leads as Array<{ lid: number; cid: number }>)
      .filter((lead) => ids.has(String(lead.cid)));
    const facilitators = (data.facilitators as Array<{ fid: number; cid: number }>)
      .filter((fac) => ids.has(String(fac.cid)));
    const meta = data.meta as Record<string, unknown>;
    res.json({
      available: true,
      authRequired: false,
      syncedAt: synced_at.toISOString(),
      windowStart: meta.window_start,
      windowEnd: meta.window_end,
      metrics: {
        schools: campuses.length,
        enrolledStudents: campuses.reduce((total, campus) => total + campus.enr, 0),
        managers: isOps ? data.managers.length : (data.managers as Array<{ id: number }>)
          .filter((manager) => Number(manager.id) === user.profileId).length,
        schoolLeads: new Set(leads.map((lead) => lead.lid)).size,
        facilitators: new Set(facilitators.map((fac) => fac.fid)).size,
      },
    });
  } catch {
    req.log.error("Dashboard summary is unavailable; private report contents were not logged");
    res.status(503).json({ error: "Reporting snapshot unavailable" });
  }
});

export default router;
