import assert from "node:assert/strict";
import express from "express";
import { cardKey, createDashboardFeedbackRouter, parseFeedback, sanitizeCardHtml } from "../routes/dashboard-feedback";

// In-memory stand-in for card_feedback. No real sessions, cards or comments are used.
export async function checkDashboardFeedback() {
  // Sanitising: nothing that can run or load survives, ordinary card markup does.
  const hostile = '<div class="execline warn" onclick="steal()"><script>alert(1)</script><span>نص</span>' +
    '<a href="javascript:alert(1)">x</a><img src=x onerror=alert(1)><iframe src="//evil"></iframe>' +
    '<style>body{display:none}</style><svg onload=alert(1)></svg></div>';
  const clean = sanitizeCardHtml(hostile);
  for (const bad of ["<script", "onclick", "onerror", "onload", "javascript:", "<iframe", "<style", "<svg"]) {
    assert(!clean.toLowerCase().includes(bad), `sanitiser left ${bad}`);
  }
  assert(clean.includes('class="execline warn"') && clean.includes("<span>نص</span>"));

  assert.equal(cardKey("insight", "a  b"), cardKey("insight", " a b "), "whitespace does not change the key");
  assert.notEqual(cardKey("insight", "a"), cardKey("ticket", "a"));

  const card = { kind: "insight", cardText: "الحضور 55%", cardHtml: '<div class="execline">الحضور 55%</div>', comment: "الرقم يحتاج مراجعة",
    context: { tab: "exec", manager: "ALL", range: "term", lang: "ar", dataThrough: "2026-10-12", unexpected: "dropped" } };
  const parsed = parseFeedback(card);
  assert(!("error" in parsed));
  assert.deepEqual(Object.keys(parsed.context).sort(), ["dataThrough", "lang", "manager", "range", "tab"]);
  for (const bad of [{ ...card, kind: "other" }, { ...card, comment: "   " }, { ...card, comment: "x".repeat(2001) },
    { ...card, cardText: "" }, { ...card, cardHtml: "x".repeat(30_001) }, null]) {
    assert("error" in parseFeedback(bad));
  }

  type Row = { id: number; profile_id: string; email: string; author_name: string | null; user_type: string | null; card_key: string; card_kind: string;
    card_text: string; card_html: string; context: Record<string, string>; comment: string; created_at: Date };
  const rows: Row[] = [];
  const query = async (sql: string, values: unknown[] = []): Promise<{ rows: any[] }> => {
    if (sql.startsWith("SELECT count(*)")) {
      return { rows: [{ n: String(rows.filter((row) => row.profile_id === String(values[0]) && Date.now() - row.created_at.getTime() < 60_000).length) }] };
    }
    if (sql.startsWith("SELECT name FROM dashboard_users")) {
      const name = values[0] === 11 ? "قائد الاختبار" : null;       // only profile 11 signed in with a name
      return { rows: name ? [{ name }] : [] };
    }
    if (sql.includes("FROM school_report_snapshots")) return { rows: [{ name: values[0] === 12 ? "مدير من التقرير" : null }] };
    if (sql.startsWith("INSERT INTO card_feedback")) {
      const row: Row = { id: rows.length + 1, profile_id: String(values[0]), email: String(values[1]), author_name: values[2] as string | null,
        user_type: values[3] as string, card_key: String(values[4]), card_kind: String(values[5]), card_text: String(values[6]),
        card_html: String(values[7]), context: JSON.parse(String(values[8])), comment: String(values[9]), created_at: new Date(Date.now() + rows.length) };
      rows.push(row);
      return { rows: [{ id: row.id, created_at: row.created_at }] };
    }
    if (sql.includes("FROM card_feedback ORDER BY created_at DESC")) return { rows: [...rows].reverse() };
    throw new Error("Unexpected test SQL");
  };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.log = { info() {}, warn() {}, error() {} } as unknown as typeof req.log; next(); });
  app.use(createDashboardFeedbackRouter({
    database: { query }, css: async () => ".execline{display:flex}",
    authenticate: async (req) => {
      const who = req.get("X-Test-Account");
      return who === "admin" ? { email: "admin@example.invalid", profileId: 800302, userType: "ADMIN" }
        : who === "lead" ? { email: "lead@example.invalid", profileId: 11, userType: "SCHOOL_LEAD" }
        : who === "manager" ? { email: "manager@example.invalid", profileId: 12, userType: "SCHOOL_MANAGER" }
        : who === "revoked" ? { email: "revoked@example.invalid", profileId: 13, userType: null } : null;
    },
  }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/dashboard`;
  const oldRedirect = process.env.DASHBOARD_OAUTH_REDIRECT_URI;
  process.env.DASHBOARD_OAUTH_REDIRECT_URI = "https://dashboard.example.invalid/oauth/callback";
  const send = (account: string, body: unknown, origin = "https://dashboard.example.invalid", header = "1") =>
    fetch(base + "/feedback", { method: "POST", body: JSON.stringify(body),
      headers: { "X-Test-Account": account, "X-Dashboard-Feedback": header, Origin: origin, "Content-Type": "application/json" } });
  const list = (account: string) => fetch(base + "/admin/feedback", { headers: { "X-Test-Account": account } });
  try {
    assert.equal((await send("", card)).status, 401);
    assert.equal((await send("revoked", card)).status, 403, "a profile without a role cannot comment");
    assert.equal((await send("lead", card, "https://evil.example.invalid")).status, 403);
    assert.equal((await send("lead", card, undefined, "0")).status, 403);
    assert.equal((await send("lead", { ...card, comment: "" })).status, 400);
    assert.equal(rows.length, 0);

    const forged = { ...card, profileId: 800302, email: "admin@example.invalid", userType: "ADMIN", createdAt: "2000-01-01", cardHtml: hostile };
    assert.equal((await send("lead", forged)).status, 201);
    assert.equal(rows[0].profile_id, "11", "author comes from the session");
    assert.equal(rows[0].email, "lead@example.invalid");
    assert.equal(rows[0].author_name, "قائد الاختبار", "name comes from the sign-in record");
    assert.equal(rows[0].user_type, "SCHOOL_LEAD");
    assert(!rows[0].card_html.includes("<script") && !rows[0].card_html.includes("onclick"), "stored markup is sanitised");
    assert.equal((await send("manager", { ...card, comment: "نفس الكارد، تعليق ثاني" })).status, 201);
    assert.equal((await send("manager", { ...card, kind: "ticket", cardText: "تذكرة أخرى", comment: "تعليق على تذكرة" })).status, 201);
    assert.equal(rows.length, 3);
    assert.equal(rows[1].author_name, "مدير من التقرير", "falls back to the report snapshot name");
    assert.equal((await send("admin", { ...card, comment: "بلا اسم" })).status, 201);
    assert.equal(rows[3].author_name, null, "no name anywhere: the email still identifies the author");
    rows.pop();

    assert.equal((await list("")).status, 401);
    assert.equal((await list("lead")).status, 403, "only admins read the feedback");
    const body = await (await list("admin")).json() as { total: number; css: string; cards: { cardText: string; comments: { name: string | null; email: string; comment: string; userType: string; createdAt: string }[] }[] };
    assert.equal(body.total, 3);
    assert(body.css.includes(".execline"));
    assert.equal(body.cards.length, 2, "comments on the same card are grouped");
    const grouped = body.cards.find((group) => group.cardText === "الحضور 55%");
    assert.equal(grouped?.comments.length, 2);
    assert.deepEqual(grouped?.comments.map((comment) => comment.email).sort(), ["lead@example.invalid", "manager@example.invalid"]);
    assert.deepEqual(grouped?.comments.map((comment) => comment.name).sort(), ["قائد الاختبار", "مدير من التقرير"].sort());
    assert(grouped?.comments.every((comment) => comment.userType && comment.createdAt));

    for (let i = 0; i < 9; i++) await send("lead", card);
    assert.equal((await send("lead", card)).status, 429, "rate limit per profile");
  } finally {
    if (oldRedirect === undefined) delete process.env.DASHBOARD_OAUTH_REDIRECT_URI; else process.env.DASHBOARD_OAUTH_REDIRECT_URI = oldRedirect;
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  console.log("Card feedback: authorship, origin, sanitising, grouping and admin-only access: PASS");
}
