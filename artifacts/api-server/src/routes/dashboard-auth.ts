import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { buildHeaders } from "@noonacademy/citadel-transport";
import { pool } from "@workspace/db";
import { Router, type IRouter, type Request, type Response } from "express";
import { dashboardCookies } from "../lib/dashboard-cookies";
import { resolveDashboardTemplate } from "../lib/dashboard-template";
import { filterDashboardReport, getDashboardScope } from "../lib/dashboard-scope";
import { effectiveUserType, isProfileAdmin } from "../lib/admin-access";
export { getDashboardScope } from "../lib/dashboard-scope";

import { embedContext, readEmbedContext, workspaceOrigin, embedMessage } from "../lib/dashboard-embed";

const router: IRouter = Router();
const cookies = dashboardCookies(process.env.NODE_ENV === "development");
const COOKIE = cookies.sessionName;
const STATE = cookies.stateName;
const EMBED = `${STATE}_embed`;
const sessionLifetimeMs = 7 * 24 * 60 * 60 * 1000;
const templatePath = resolveDashboardTemplate();

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
const staffRoles = ["ADMIN", "SCHOOL_MANAGER", "SCHOOL_LEAD", "FACILITATOR", "CLUSTER_MANAGER"] as const;
function isStaffRole(role: string | null | undefined): boolean {
  return staffRoles.some((allowed) => allowed === role);
}
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}
function signInMessage(message: string): string {
  return `<p>${escapeHtml(message)}</p><p><a href="/api/dashboard/login?start=1" target="_blank" rel="noopener noreferrer">Switch profile in a new tab</a> and choose your staff profile in Citadel.</p>`;
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

function loginPage(res: Response, message = "Open Insights in a new tab to sign in with Noon.", origin: string | null = null, retry: { origin: string; attempt: string } | null = null) {
  const nonce = randomBytes(16).toString("hex");
  const loginUrl = "/api/dashboard/login?start=1" + (retry ? `&workspace=${encodeURIComponent(retry.origin)}&attempt=${retry.attempt}` : "");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Content-Security-Policy", `default-src 'none'; script-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'; frame-ancestors 'self' https://replit.com https://*.replit.com https://school.noonacademy.com https://school.staging.noonedu.io`);
  res.type("html").send(
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>School Insights sign-in</title></head><body>' +
    `<h1>School Insights</h1><p>${escapeHtml(message)}</p>` +
    (origin ? "" : `<p><a href="${escapeHtml(loginUrl)}" target="${retry ? "_self" : "_blank"}" rel="noopener noreferrer">${retry ? "Try sign-in again" : "Open Insights in a new tab"}</a></p>`) +
    '<p>Choose your staff profile in Citadel.</p>' + (origin ? embedMessage(origin, 'login-required', nonce) : '') + '</body></html>',
  );
}

function loginCorrelationId(cfg: Config | null, state: unknown): string {
  if (!cfg || typeof state !== "string" || !/^[a-f0-9]{64}$/.test(state)) return randomUUID();
  return createHmac("sha256", cfg.sessionSecret).update("dashboard-login:" + state).digest("hex").slice(0, 24);
}

router.get("/dashboard/login", (req, res): void => {
  const cfg = config();
  if (!cfg) {
    res.status(503);
    loginPage(res, "Sign-in is unavailable. Ask your school administrator to check the Insights configuration, then try again.");
    return;
  }
  // Start OAuth only after leaving an embedded page, before setting its state cookie.
  if (req.query.start !== "1" || req.headers["sec-fetch-dest"] === "iframe" || req.headers["sec-fetch-dest"] === "frame") {
    const origin = workspaceOrigin(req.query.workspace);
    loginPage(res, origin ? "Use the sign-in button in your school workspace to continue here." : undefined, origin);
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.clearCookie(COOKIE, sessionCookie);
  const state = randomBytes(32).toString("hex");
  const correlationId = loginCorrelationId(cfg, state);
  res.setHeader("X-Dashboard-Auth-Id", correlationId);
  res.clearCookie(STATE, { ...csrfCookie, path: "/api/dashboard/oauth/callback" });
  res.cookie(STATE, state, { ...csrfCookie, maxAge: 10 * 60_000 });
  res.clearCookie(EMBED, csrfCookie);
  const context = embedContext(req.query.workspace, req.query.attempt, state, cfg.sessionSecret);
  if (context) res.cookie(EMBED, context, { ...csrfCookie, maxAge: 10 * 60_000 });
  const url = new URL("/portal/oauth/authorize", cfg.baseUrl);
  url.search = new URLSearchParams({
    app_id: cfg.appId, redirect_uri: cfg.redirectUri, response_type: "code", state,
  }).toString();
  req.log.info({ event: "dashboard_oauth", reason: "login_started", correlationId }, "School Insights sign-in");
  res.redirect(302, url.toString());
});

export async function dashboardOAuthCallback(req: Request, res: Response): Promise<void> {
  res.setHeader("Cache-Control", "no-store");
  res.clearCookie(COOKIE, sessionCookie);
  const cfg = config();
  const expected = cookie(req, STATE);
  res.clearCookie(STATE, csrfCookie);
  const correlationId = loginCorrelationId(cfg, req.query.state);
  res.setHeader("X-Dashboard-Auth-Id", correlationId);
  let verifiedProfileId: number | undefined;
  let verifiedRole: string | undefined;
  const reject = (status: number, reason: string, message: string) => {
    req.log.warn({ event: "dashboard_oauth", reason, correlationId, profileId: verifiedProfileId, userType: verifiedRole }, "School Insights sign-in rejected");
    res.status(status);
    loginPage(res, `${message} Reference: ${correlationId}.`, null,
      cfg ? readEmbedContext(cookie(req, EMBED), expected ?? "", cfg.sessionSecret) : null);
  };
  if (!cfg) {
    reject(400, "configuration_missing", "Sign-in is unavailable. Ask your school administrator to check the Insights configuration.");
    return;
  }
  if (req.headers["sec-fetch-dest"] === "iframe" || req.headers["sec-fetch-dest"] === "frame") {
    reject(400, "embedded_callback", "Open a new tab and start sign-in again.");
    return;
  }
  if (typeof req.query.state !== "string" || !/^[a-f0-9]{64}$/.test(req.query.state) ||
      typeof req.query.code !== "string" || !req.query.code) {
    reject(400, "invalid_callback_parameters", "The sign-in link is incomplete. Start sign-in again.");
    return;
  }
  if (!expected) {
    reject(400, "state_cookie_missing", "Your sign-in expired or its cookie is unavailable. Start sign-in again in a new tab.");
    return;
  }
  if (!/^[a-f0-9]{64}$/.test(expected) || !timingSafeEqual(Buffer.from(expected), Buffer.from(req.query.state))) {
    reject(400, "state_mismatch", "This sign-in does not match your latest attempt. Start sign-in again.");
    return;
  }
  let stage = "token_exchange";
  try {
    const exchange = obj(await oauthPost(cfg, "/api/oauth/token", { code: req.query.code }));
    const profile = obj(exchange.profile);
    const account = obj(profile.account);
    const email = (typeof profile.email === "string" ? profile.email : account.email);
    const profileId = profile.id;
    if (typeof email !== "string" || !/(?:@noonacademy\.com|@noon\.edu\.sa|@non\.sa)$/i.test(email) ||
        !Number.isSafeInteger(profileId) || Number(profileId) <= 0) {
      reject(403, "profile_not_authorized", "This account cannot view school reports. Sign in with your Noon staff account.");
      return;
    }
    verifiedProfileId = Number(profileId);
    const displayName = [profile.name, account.name].find((value): value is string => typeof value === "string" && !!value.trim())?.trim().slice(0, 120) ?? null;
    const userType = verifiedCitadelUserType(profile);
    if (!isStaffRole(userType)) {
      reject(403, userType ? "unsupported_profile_role" : "profile_role_missing",
        "This profile cannot open school reports. Sign in again and choose a supported staff profile in Citadel.");
      return;
    }
    verifiedRole = userType!;
    stage = "token_response";
    const issued = tokens(obj(exchange.token));
    stage = "session_store";
    const snapshot = await pool.query("SELECT 1 FROM school_report_snapshots LIMIT 1");
    const sessionId = randomBytes(32).toString("hex");
    await pool.query(
      "INSERT INTO dashboard_sessions (session_hash, email, profile_id, user_type, refresh_token, access_expires_at, expires_at) " +
      "VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [digest(sessionId), email.toLowerCase(), profileId, userType, encrypt(cfg, issued.refreshToken),
        new Date(Date.now() + issued.expiresIn * 1000), new Date(Date.now() + sessionLifetimeMs)],
    );
    // Usage record for the admin console. A failure here must never block sign-in.
    try {
      await pool.query(
        "INSERT INTO dashboard_users (profile_id, email, last_user_type, name) VALUES ($1, $2, $3, $4) " +
        "ON CONFLICT (profile_id) DO UPDATE SET email = EXCLUDED.email, last_user_type = EXCLUDED.last_user_type, " +
        "name = COALESCE(EXCLUDED.name, dashboard_users.name), last_seen_at = now(), login_count = dashboard_users.login_count + 1",
        [profileId, email.toLowerCase(), userType, displayName],
      );
      await pool.query("INSERT INTO dashboard_login_events (profile_id, user_type) VALUES ($1, $2)", [profileId, userType]);
    } catch {
      req.log.warn({ event: "dashboard_oauth", reason: "usage_record_failed", correlationId }, "Sign-in usage was not recorded");
    }
    res.cookie(COOKIE, sessionId, { ...sessionCookie, maxAge: sessionLifetimeMs });
    req.log.info({ event: "dashboard_oauth", reason: "session_created", correlationId, profileId, userType }, "School Insights sign-in complete");
    res.setHeader("Cache-Control", "no-store");
    // Authentication must work before the first reporting import. The landing
    // page can show the verified session's readiness state instead of a 503.
    const context = readEmbedContext(cookie(req, EMBED), String(req.query.state), cfg.sessionSecret);
    res.clearCookie(EMBED, csrfCookie);
    if (context) {
      const nonce = randomBytes(16).toString("hex");
      res.setHeader("Content-Security-Policy", `default-src 'none'; script-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'`);
      res.type("html").send(`<!doctype html><html><head><meta name="referrer" content="no-referrer"><title>Insights sign-in complete</title></head><body><p>Sign-in is complete. Return to your school workspace to view Insights.</p><a href="${context.origin}/dashboard/school-insights?insightsLogin=complete">Return to school workspace</a><script nonce="${nonce}">if(window.opener){window.opener.postMessage({type:"school-insights:authenticated",attempt:${JSON.stringify(context.attempt)}},${JSON.stringify(context.origin)});window.close();}</script></body></html>`);
      return;
    }
    res.redirect(302, dashboardPostLoginPath(snapshot.rows.length > 0));
  } catch {
    reject(502, `${stage}_failed`, "Sign-in is temporarily unavailable. Start sign-in again.");
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
    if (!stored || stored.expires_at.getTime() <= Date.now() || !isStaffRole(stored.user_type)) {
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
    // Admin comes from the admin list plus console overrides, never from the Citadel role alone.
    const profileId = Number(stored.profile_id);
    const admin = await isProfileAdmin(client, profileId);
    await client.query("COMMIT");
    return { email: stored.email, profileId, userType: effectiveUserType(stored.user_type, admin) };
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
  return isDashboardAdmin(user) || (!user.userType && approved.includes(user.email.trim().toLowerCase()));
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
      const origin = workspaceOrigin(req.query.workspace);
      res.redirect(302, "/api/dashboard/login" + (origin ? "?workspace=" + encodeURIComponent(origin) : ""));
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
    const { campuses } = getDashboardScope(user, document);
    if (!campuses.length) {
      res.status(403).type("html").send(
        signInMessage(`Signed in as ${user.email} (${user.userType}). No schools are assigned to this profile in the latest report. Ask your school administrator to check your assignments, or switch profile.`) +
        (workspaceOrigin(req.query.workspace) ? embedMessage(workspaceOrigin(req.query.workspace)!, "ready") : ""),
      );
      return;
    }
    const filtered = filterDashboardReport(user, document);
    const original = await readFile(templatePath, "utf8");
    if (!original.includes("/*__DATA__*/")) throw new Error("Dashboard template is incomplete");
    const payload = "const DATA = " + JSON.stringify({ ...filtered, viewer: { email: user.email, userType: user.userType } }).replace(/</g, "\\u003c") + ";";
    const title = "noon · School Manager Dashboard";
    res.setHeader("Content-Security-Policy",
      "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; " +
      "font-src data:; connect-src 'self'; base-uri 'none'; form-action 'none'; " +
      "frame-ancestors 'self' https://replit.com https://*.replit.com " +
      "https://school.noonacademy.com https://school.staging.noonedu.io");
    res.type("html").send(
      `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" ` +
      `content="width=device-width, initial-scale=1"><title>${title}</title></head><body>` +
      original.replace("/*__DATA__*/", payload) + (workspaceOrigin(req.query.workspace) ? embedMessage(workspaceOrigin(req.query.workspace)!, "ready") : "") + "</body></html>",
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
