import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { buildHeaders } from "@noonacademy/citadel-transport";
import { pool } from "@workspace/db";
import { Router, type IRouter, type Request, type Response } from "express";
import { dashboardCookies } from "../lib/dashboard-cookies";

const router: IRouter = Router();
const cookies = dashboardCookies(process.env.NODE_ENV === "development");
const COOKIE = cookies.sessionName;
const STATE = cookies.stateName;
const sessionLifetimeMs = 7 * 24 * 60 * 60 * 1000;
const templatePath = fileURLToPath(new URL("../../school-staff-dashboard/source/src/app.html", import.meta.url));

function cookie(req: Request, name: string): string | undefined {
  const part = (req.headers.cookie ?? "").split(";").map((piece) => piece.trim())
    .find((piece) => piece.startsWith(name + "="));
  return part?.slice(name.length + 1);
}
function config() {
  const { SYNAPSE_APP_ID: appId, SYNAPSE_APP_SECRET: appSecret, SYNAPSE_BASE_URL: baseUrl,
    SESSION_SECRET: sessionSecret } = process.env;
  const redirectUri = process.env.DASHBOARD_OAUTH_REDIRECT_URI ||
    (process.env.NODE_ENV === "development" && process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}/oauth/callback` : "");
  if (!appId || !appSecret || !baseUrl || !sessionSecret || !redirectUri) {
    return null;
  }
  try {
    if (new URL(baseUrl).protocol !== "https:" || new URL(redirectUri).protocol !== "https:") return null;
  } catch {
    return null;
  }
  return { appId, appSecret, baseUrl: baseUrl.replace(/\/+$/, ""), sessionSecret, redirectUri };
}
type Config = NonNullable<ReturnType<typeof config>>;
function key(cfg: Config): Buffer {
  return Buffer.from(hkdfSync("sha256", cfg.sessionSecret, Buffer.alloc(0), "dashboard-refresh-v1", 32));
}
function encrypt(cfg: Config, value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(cfg), iv);
  const body = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}
function decrypt(cfg: Config, encoded: string) {
  const buf = Buffer.from(encoded, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(cfg), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}
function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
async function oauthPost(cfg: Config, path: "/api/oauth/token" | "/api/oauth/refresh", body: object): Promise<unknown> {
  const raw = JSON.stringify(body);
  const response = await fetch(new URL(path, cfg.baseUrl), {
    method: "POST",
    body: raw,
    headers: buildHeaders(cfg, path, raw),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error("refresh-rejected");
    throw new Error("citadel-unavailable");
  }
  return response.json();
}
function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
// Only call this with Citadel's server-to-server token-exchange profile.
// The requested login audience and browser-supplied roles are not role evidence.
export function verifiedCitadelUserType(profile: unknown): string | null {
  const value = obj(profile).userType;
  return typeof value === "string" && value.trim() ? value.trim().toUpperCase() : null;
}
function tokens(input: unknown) {
  const value = obj(input);
  if (typeof value.refreshToken !== "string" || !value.refreshToken ||
      typeof value.accessToken !== "string" || !value.accessToken) throw new Error("invalid-token-response");
  return {
    refreshToken: value.refreshToken,
    expiresIn: typeof value.expiresIn === "number" && value.expiresIn > 0 ? value.expiresIn : 60,
  };
}
const sessionCookie = cookies.sessionOptions;
const csrfCookie = cookies.stateOptions;

export function dashboardPostLoginPath(hasSnapshot: boolean) {
  return hasSnapshot ? "/api/dashboard/report" : "/";
}

router.get("/dashboard/login", (req, res): void => {
  const cfg = config();
  if (!cfg) {
    res.status(503).send("Noon sign-in is not configured for this environment.");
    return;
  }
  const state = randomBytes(32).toString("hex");
  res.clearCookie(STATE, { ...csrfCookie, path: "/api/dashboard/oauth/callback" });
  res.cookie(STATE, state, { ...csrfCookie, maxAge: 10 * 60_000 });
  const url = new URL("/portal/oauth/authorize", cfg.baseUrl);
  url.search = new URLSearchParams({
    app_id: cfg.appId, redirect_uri: cfg.redirectUri, response_type: "code", state,
    // Multi-audience Citadel apps must explicitly select the staff login audience.
    userType: "ADMIN",
  }).toString();
  res.setHeader("Cache-Control", "no-store");
  res.redirect(302, url.toString());
});

export async function dashboardOAuthCallback(req: Request, res: Response): Promise<void> {
  const cfg = config();
  const expected = cookie(req, STATE);
  res.clearCookie(STATE, csrfCookie);
  if (!cfg || typeof req.query.state !== "string" || typeof req.query.code !== "string" ||
      !expected || !/^[a-f0-9]{64}$/.test(expected) || !/^[a-f0-9]{64}$/.test(req.query.state) ||
      !timingSafeEqual(Buffer.from(expected), Buffer.from(req.query.state))) {
    res.status(400).send("Noon sign-in could not be verified. Please start again.");
    return;
  }
  try {
    const exchange = obj(await oauthPost(cfg, "/api/oauth/token", { code: req.query.code }));
    const profile = obj(exchange.profile);
    const account = obj(profile.account);
    const email = (typeof profile.email === "string" ? profile.email : account.email);
    const profileId = profile.id;
    if (typeof email !== "string" || !/(?:@noonacademy\.com|@noon\.edu\.sa|@non\.sa)$/i.test(email) ||
        !Number.isSafeInteger(profileId) || Number(profileId) <= 0) {
      res.status(403).send("This Noon account is not authorized to view school reports.");
      return;
    }
    const issued = tokens(obj(exchange.token));
    const snapshot = await pool.query("SELECT 1 FROM school_report_snapshots LIMIT 1");
    const sessionId = randomBytes(32).toString("hex");
    await pool.query(
      "INSERT INTO dashboard_sessions (session_hash, email, profile_id, user_type, refresh_token, access_expires_at, expires_at) " +
      "VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [digest(sessionId), email.toLowerCase(), profileId, verifiedCitadelUserType(profile), encrypt(cfg, issued.refreshToken),
        new Date(Date.now() + issued.expiresIn * 1000), new Date(Date.now() + sessionLifetimeMs)],
    );
    res.cookie(COOKIE, sessionId, { ...sessionCookie, maxAge: sessionLifetimeMs });
    res.setHeader("Cache-Control", "no-store");
    // Authentication must work before the first reporting import. The landing
    // page can show the verified session's readiness state instead of a 503.
    res.redirect(302, dashboardPostLoginPath(snapshot.rows.length > 0));
  } catch {
    req.log.warn("Noon token exchange failed; no session was issued");
    res.status(502).send("Noon sign-in is temporarily unavailable. Please try again.");
  }
}

router.get("/dashboard/oauth/callback", dashboardOAuthCallback);

type Session = {
  email: string;
  profile_id: string;
  user_type: string | null;
  refresh_token: string;
  access_expires_at: Date;
  expires_at: Date;
};
async function currentUser(req: Request, cfg: Config): Promise<{ email: string; profileId: number; userType: string | null } | null> {
  const secret = cookie(req, COOKIE);
  if (!secret || !/^[a-f0-9]{64}$/.test(secret)) return null;
  const hash = digest(secret);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<Session>(
      "SELECT email, profile_id, user_type, refresh_token, access_expires_at, expires_at " +
      "FROM dashboard_sessions WHERE session_hash = $1 FOR UPDATE", [hash],
    );
    const stored = result.rows[0];
    if (!stored || stored.expires_at.getTime() <= Date.now()) {
      await client.query("ROLLBACK");
      return null;
    }
    if (stored.access_expires_at.getTime() <= Date.now() + 60_000) {
      try {
        const rotated = tokens(await oauthPost(cfg, "/api/oauth/refresh",
          { refreshToken: decrypt(cfg, stored.refresh_token) }));
        await client.query(
          "UPDATE dashboard_sessions SET refresh_token = $1, access_expires_at = $2 WHERE session_hash = $3",
          [encrypt(cfg, rotated.refreshToken), new Date(Date.now() + rotated.expiresIn * 1000), hash],
        );
      } catch (error) {
        if (error instanceof Error && error.message === "refresh-rejected") {
          await client.query("DELETE FROM dashboard_sessions WHERE session_hash = $1", [hash]);
          await client.query("COMMIT");
          return null;
        }
        throw error;
      }
    }
    await client.query("COMMIT");
    return { email: stored.email, profileId: Number(stored.profile_id), userType: stored.user_type };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getDashboardUser(req: Request) {
  const cfg = config();
  return cfg ? currentUser(req, cfg) : null;
}

export function isDashboardAdmin(user: { userType?: string | null }) {
  return user.userType === "ADMIN";
}

export function isDashboardOps(user: { email: string; userType?: string | null }) {
  const approved = (process.env.DASHBOARD_OPS_EMAILS ?? "")
    .split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
  return isDashboardAdmin(user) || approved.includes(user.email.toLowerCase());
}

export function getDashboardScope(user: { email: string; profileId: number; userType?: string | null }, document: Record<string, unknown>) {
  const all = Array.isArray(document.campuses) ? document.campuses : [];
  const isOps = isDashboardOps(user);
  return {
    isOps,
    campuses: isOps ? all : all.filter((campus) =>
      String(obj(campus).mgr ?? "").split(",").includes(String(user.profileId))),
  };
}

router.get("/dashboard/report", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  const cfg = config();
  if (!cfg) {
    res.status(503).send("Noon sign-in is not configured for this environment.");
    return;
  }
  try {
    const user = await currentUser(req, cfg);
    if (!user) {
      res.redirect(302, "/api/dashboard/login");
      return;
    }
    const snapshot = await pool.query<{ document: unknown }>(
      "SELECT document FROM school_report_snapshots ORDER BY id DESC LIMIT 1",
    );
    if (!snapshot.rows.length) {
      res.status(503).send("Reporting data is not available yet.");
      return;
    }
    const document = obj(snapshot.rows[0].document);
    const { isOps, campuses } = getDashboardScope(user, document);
    if (!campuses.length) {
      res.status(403).send("Your Noon account does not have access to these schools.");
      return;
    }
    const ids = new Set(campuses.map((campus) => String(obj(campus).id)));
    const select = (key: string, getId: (item: unknown) => unknown) =>
      (Array.isArray(document[key]) ? document[key] : []).filter((item: unknown) => ids.has(String(getId(item))));
    const filtered = isOps ? document : {
      ...document,
      managers: (Array.isArray(document.managers) ? document.managers : [])
        .filter((item: unknown) => Number(obj(item).id) === user.profileId),
      campuses: campuses.map((campus) => ({ ...obj(campus), mgr: String(user.profileId) })),
      exams: select("exams", (item) => obj(item).id),
      weekly: (Array.isArray(document.weekly) ? document.weekly : [])
        .filter((item: unknown) => Number(obj(item).mid) === user.profileId),
      facilitators: select("facilitators", (item) => obj(item).cid),
      leads: select("leads", (item) => obj(item).cid),
      bygrade: select("bygrade", (item) => Array.isArray(item) ? item[0] : undefined),
      students: select("students", (item) => Array.isArray(item) ? item[1] : undefined),
      comments: select("comments", (item) => Array.isArray(item) ? item[0] : undefined),
      orphanCohorts: select("orphanCohorts", (item) => obj(item).c),
      // Global comparison data spans unassigned schools; managers may not view it.
      simgrades: [],
    };
    const original = await readFile(templatePath, "utf8");
    if (!original.includes("/*__DATA__*/")) throw new Error("Dashboard template is incomplete");
    const payload = "const DATA = " + JSON.stringify(filtered).replace(/</g, "\\u003c") + ";";
    const title = "noon · School Manager Dashboard";
    res.setHeader("Content-Security-Policy",
      "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; " +
      "font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'; " +
      "frame-ancestors 'self' https://replit.com https://*.replit.com");
    res.type("html").send(
      `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" ` +
      `content="width=device-width, initial-scale=1"><title>${title}</title></head><body>` +
      original.replace("/*__DATA__*/", payload) + "</body></html>",
    );
  } catch {
    req.log.error("Protected dashboard could not load; no private data was logged");
    res.status(503).send("The detailed dashboard is temporarily unavailable.");
  }
});

router.post("/dashboard/logout", async (req, res): Promise<void> => {
  const sessionId = cookie(req, COOKIE);
  if (sessionId && /^[a-f0-9]{64}$/.test(sessionId)) {
    await pool.query("DELETE FROM dashboard_sessions WHERE session_hash = $1", [digest(sessionId)]);
  }
  res.clearCookie(COOKIE, sessionCookie);
  res.status(204).end();
});

export default router;
