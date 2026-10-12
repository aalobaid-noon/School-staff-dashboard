import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { getDashboardUser } from "./dashboard-auth";
import { originAllowed } from "./dashboard-admin";
import { resolveDashboardTemplate } from "../lib/dashboard-template";
import type { Queryable } from "../lib/admin-access";

export const MAX_COMMENT = 2000;
const MAX_CARD_HTML = 30_000;
const MAX_CARD_TEXT = 3000;
const PER_MINUTE = 10;
const KINDS = ["insight", "ticket", "win"] as const;
const ROLES = ["ADMIN", "SCHOOL_MANAGER", "CLUSTER_MANAGER", "SCHOOL_LEAD", "FACILITATOR"];

type DashboardUser = NonNullable<Awaited<ReturnType<typeof getDashboardUser>>>;

// Card markup comes from the browser, so it is untrusted. The admin page shows it inside a sandboxed
// iframe without scripts; this is a second layer that removes everything that could run or load.
export function sanitizeCardHtml(html: string): string {
  return html
    .replace(/<(script|style|iframe|object|embed|link|meta|base|form|svg|math)\b[\s\S]*?(<\/\1\s*>|$)/gi, "")
    .replace(/<\/?(script|style|iframe|object|embed|link|meta|base|form|svg|math)\b[^>]*>/gi, "")
    .replace(/\s(on[a-z]+|srcdoc|formaction)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(href|src|xlink:href|action)\s*=\s*("\s*(javascript|data|vbscript):[^"]*"|'\s*(javascript|data|vbscript):[^']*')/gi, "");
}

export function cardKey(kind: string, text: string): string {
  return createHash("sha256").update(kind + "|" + text.replace(/\s+/g, " ").trim()).digest("hex").slice(0, 32);
}

export type FeedbackInput = { kind: typeof KINDS[number]; cardText: string; cardHtml: string; comment: string; context: Record<string, string> };

export function parseFeedback(body: unknown): FeedbackInput | { error: string } {
  const value = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const text = (field: unknown, max: number) => typeof field === "string" ? field.trim().slice(0, max) : "";
  const kind = KINDS.find((candidate) => candidate === value.kind);
  const comment = typeof value.comment === "string" ? value.comment.trim() : "";
  const cardText = text(value.cardText, MAX_CARD_TEXT);
  const rawHtml = typeof value.cardHtml === "string" ? value.cardHtml : "";
  if (!kind) return { error: "Unknown card type." };
  if (!comment) return { error: "Write a comment first." };
  if (comment.length > MAX_COMMENT) return { error: `Comments are limited to ${MAX_COMMENT} characters.` };
  if (!cardText || !rawHtml) return { error: "The card could not be read." };
  if (rawHtml.length > MAX_CARD_HTML) return { error: "The card is too large to attach." };
  // Context is a small fixed set of short strings, so it cannot be used to smuggle content.
  const raw = value.context && typeof value.context === "object" ? value.context as Record<string, unknown> : {};
  const context: Record<string, string> = {};
  for (const key of ["tab", "manager", "range", "lang", "dataThrough"]) {
    if (typeof raw[key] === "string") context[key] = (raw[key] as string).slice(0, 60);
  }
  return { kind, cardText, cardHtml: sanitizeCardHtml(rawHtml), comment, context };
}

let cssCache: string | undefined;
async function dashboardCss(): Promise<string> {
  if (cssCache === undefined) {
    const html = await readFile(resolveDashboardTemplate(), "utf8");
    cssCache = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => match[1]).join("\n");
  }
  return cssCache;
}

// The commenter's display name: what Citadel gave us at their last sign-in, else the name the latest
// report snapshot holds for that profile (manager, lead or facilitator). Null is fine; the email always shows.
export async function authorName(database: Queryable, profileId: number): Promise<string | null> {
  try {
    const known = await database.query<{ name: string | null }>("SELECT name FROM dashboard_users WHERE profile_id = $1", [profileId]);
    if (known.rows[0]?.name) return known.rows[0].name;
    const fromReport = await database.query<{ name: string | null }>(
      "SELECT COALESCE(" +
      "(SELECT m->>'name' FROM jsonb_array_elements(document->'managers') m WHERE (m->>'id')::bigint = $1 LIMIT 1), " +
      "(SELECT l->>'name' FROM jsonb_array_elements(document->'leads') l WHERE (l->>'lid')::bigint = $1 LIMIT 1), " +
      "(SELECT f->>'fname' FROM jsonb_array_elements(document->'facilitators') f WHERE (f->>'fid')::bigint = $1 LIMIT 1)) AS name " +
      "FROM school_report_snapshots ORDER BY id DESC LIMIT 1", [profileId]);
    return fromReport.rows[0]?.name ?? null;
  } catch {
    return null;
  }
}

export function createDashboardFeedbackRouter(dependencies: {
  database?: Queryable; authenticate?: typeof getDashboardUser; css?: () => Promise<string>;
} = {}) {
  const database = dependencies.database ?? pool;
  const authenticate = dependencies.authenticate ?? getDashboardUser;
  const css = dependencies.css ?? dashboardCss;
  const router: IRouter = Router();

  async function signedIn(req: Request, res: Response): Promise<DashboardUser | null> {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const user = await authenticate(req);
    if (!user) { res.status(401).json({ error: "Sign in with Noon first." }); return null; }
    return user;
  }

  // Any signed-in staff member may comment on a card they can see. Author, role and time come from
  // the verified session, never from the request.
  router.post("/dashboard/feedback", async (req, res): Promise<void> => {
    try {
      const user = await signedIn(req, res);
      if (!user) return;
      if (!user.userType || !ROLES.includes(user.userType)) { res.status(403).json({ error: "This profile cannot comment." }); return; }
      if (!originAllowed(req, "X-Dashboard-Feedback")) { res.status(403).json({ error: "Request origin was not accepted." }); return; }
      const input = parseFeedback(req.body);
      if ("error" in input) { res.status(400).json({ error: input.error }); return; }
      const recent = await database.query<{ n: string }>(
        "SELECT count(*) AS n FROM card_feedback WHERE profile_id = $1 AND created_at > now() - interval '1 minute'", [user.profileId]);
      if (Number(recent.rows[0]?.n ?? 0) >= PER_MINUTE) { res.status(429).json({ error: "Too many comments. Wait a minute." }); return; }
      const saved = await database.query<{ id: number; created_at: Date }>(
        "INSERT INTO card_feedback (profile_id, email, author_name, user_type, card_key, card_kind, card_text, card_html, context, comment) " +
        "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id, created_at",
        [user.profileId, user.email, await authorName(database, user.profileId), user.userType, cardKey(input.kind, input.cardText), input.kind,
          input.cardText, input.cardHtml, JSON.stringify(input.context), input.comment]);
      res.status(201).json({ id: saved.rows[0]?.id ?? null, createdAt: (saved.rows[0]?.created_at ?? new Date()).toISOString() });
    } catch {
      req.log.error("Card feedback could not be saved; no private data was logged");
      res.status(503).json({ error: "The comment could not be saved. Please retry." });
    }
  });

  router.get("/dashboard/admin/feedback", async (req, res): Promise<void> => {
    try {
      const user = await signedIn(req, res);
      if (!user) return;
      if (user.userType !== "ADMIN") { res.status(403).json({ error: "Admins only." }); return; }
      const rows = await database.query<{
        id: number; profile_id: string; email: string; author_name: string | null; user_type: string | null; card_key: string; card_kind: string;
        card_text: string; card_html: string; context: Record<string, string>; comment: string; created_at: Date;
      }>("SELECT id, profile_id, email, author_name, user_type, card_key, card_kind, card_text, card_html, context, comment, created_at " +
        "FROM card_feedback ORDER BY created_at DESC LIMIT 500");
      // One group per card, newest activity first; the card shown is its most recent snapshot.
      const groups = new Map<string, {
        cardKey: string; kind: string; cardText: string; cardHtml: string; lang: string;
        comments: { id: number; profileId: number; name: string | null; email: string; userType: string | null; comment: string; createdAt: string; context: Record<string, string> }[];
      }>();
      for (const row of rows.rows) {
        let group = groups.get(row.card_key);
        if (!group) {
          group = { cardKey: row.card_key, kind: row.card_kind, cardText: row.card_text, cardHtml: sanitizeCardHtml(row.card_html),
            lang: row.context?.lang === "en" ? "en" : "ar", comments: [] };
          groups.set(row.card_key, group);
        }
        group.comments.push({ id: row.id, profileId: Number(row.profile_id), name: row.author_name, email: row.email, userType: row.user_type,
          comment: row.comment, createdAt: row.created_at.toISOString(), context: row.context ?? {} });
      }
      res.json({ total: rows.rows.length, css: await css(), cards: [...groups.values()] });
    } catch {
      req.log.error("Card feedback list is unavailable; no private data was logged");
      res.status(503).json({ error: "Card feedback is temporarily unavailable." });
    }
  });

  return router;
}

export default createDashboardFeedbackRouter();
