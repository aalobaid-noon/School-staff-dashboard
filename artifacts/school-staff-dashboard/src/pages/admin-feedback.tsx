import { useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Languages, MessageSquare, ShieldCheck } from "lucide-react";
import { NoonSignIn } from "@/components/noon-sign-in";
import { AdminApiError, useCardFeedback, type FeedbackCard } from "@/lib/admin-api";

const KIND: Record<string, { ar: string; en: string }> = {
  insight: { ar: "ملخص", en: "Insight" }, ticket: { ar: "تذكرة", en: "Ticket" }, win: { ar: "إشادة", en: "Win" },
};

// The card is the HTML the commenter saw. It is untrusted, so it renders in a sandboxed iframe with no
// scripts and a CSP that blocks everything except inline styles; allow-same-origin only lets this page
// read the frame's height.
function CardFrame({ card, css }: { card: FeedbackCard; css: string }) {
  const [height, setHeight] = useState(90);
  const doc = `<!doctype html><html dir="${card.lang === "en" ? "ltr" : "rtl"}"><head><meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">` +
    `<style>${css}</style><style>html,body{margin:0;background:transparent}body{padding:2px}.fb-btn{display:none}</style></head>` +
    `<body><div id="root" dir="${card.lang === "en" ? "ltr" : "rtl"}">${card.cardHtml}</div></body></html>`;
  return (
    <iframe
      title={card.cardText.slice(0, 60)} sandbox="allow-same-origin" srcDoc={doc} className="fb-frame" style={{ height }}
      onLoad={(event) => {
        const body = event.currentTarget.contentDocument?.body;
        if (body) setHeight(Math.max(60, body.scrollHeight + 8));
      }}
    />
  );
}

const ROLE: Record<string, { ar: string; en: string }> = {
  ADMIN: { ar: "أدمن", en: "Admin" }, SCHOOL_MANAGER: { ar: "مدير مدرسة", en: "School manager" },
  CLUSTER_MANAGER: { ar: "مدير مجموعة", en: "Cluster manager" }, SCHOOL_LEAD: { ar: "قائد مدرسة", en: "School lead" },
  FACILITATOR: { ar: "ميسّر", en: "Facilitator" },
};

export default function AdminFeedbackPage() {
  const [language, setLanguage] = useState<"ar" | "en">("ar");
  const ar = language === "ar";
  const t = (arabic: string, english: string) => (ar ? arabic : english);
  const locale = ar ? "ar-EG-u-nu-latn" : "en-US";
  const when = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  const feedback = useCardFeedback();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");

  const cards = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (feedback.data?.cards ?? []).filter((card) => (kind === "all" || card.kind === kind) && (!needle ||
      card.cardText.toLowerCase().includes(needle) ||
      card.comments.some((c) => c.comment.toLowerCase().includes(needle) || c.email.toLowerCase().includes(needle) ||
        (c.name ?? "").toLowerCase().includes(needle))));
  }, [feedback.data, query, kind]);

  return (
    <div className={`first-run admin-page ${ar ? "rtl" : ""}`} dir={ar ? "rtl" : "ltr"} lang={language}>
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true"><ShieldCheck size={22} /></div>
          <div>
            <div className="brand-name">noon</div>
            <div className="brand-caption">Cards Feedback</div>
          </div>
        </div>
        <div className="header-tools">
          <Link className="copy-button" href="/admin" data-testid="link-feedback-admin"><ArrowLeft size={14} />{t("لوحة الأدمن", "Admin console")}</Link>
          <button className="lang-toggle" type="button" onClick={() => setLanguage(ar ? "en" : "ar")}>
            <Languages size={15} strokeWidth={1.8} />{ar ? "English" : "العربية"}
          </button>
        </div>
      </header>

      <main className="page-shell">
        {feedback.isPending && <div className="summary-state" role="status">{t("جارٍ التحميل…", "Loading…")}</div>}
        {feedback.error && (
          <div className="summary-state" role="alert" data-testid="status-feedback-error">
            <strong>
              {feedback.error instanceof AdminApiError && feedback.error.status === 401 ? t("سجّل الدخول بحساب Noon أولًا.", "Sign in with Noon first.")
                : feedback.error instanceof AdminApiError && feedback.error.status === 403 ? t("هذه الصفحة للأدمن فقط.", "This page is for admins only.")
                  : t("تعذّر تحميل التعليقات.", "Could not load the comments.")}
            </strong>
            <NoonSignIn isArabic={ar} />
          </div>
        )}
        {feedback.data && (
          <section className="workspace-card">
            <div className="card-heading">
              <div className="card-heading-label"><MessageSquare className="heading-icon" size={17} strokeWidth={1.8} />
                <span>Cards Feedback</span></div>
              <span className="card-heading-note">{feedback.data.total} {t("تعليق", "comments")} · {feedback.data.cards.length} {t("كارد", "cards")}</span>
            </div>
            <div className="card-body">
              <div className="admin-toolbar">
                {(["all", "insight", "ticket", "win"] as const).map((key) => (
                  <button key={key} type="button" className={`copy-button${kind === key ? " admin-active" : ""}`} onClick={() => setKind(key)}>
                    {key === "all" ? t("الكل", "All") : ar ? KIND[key].ar : KIND[key].en}
                  </button>))}
                <input className="fb-search" placeholder={t("ابحث في الكارد أو التعليق أو الكاتب", "Search card, comment or author")} value={query}
                  onChange={(event) => setQuery(event.target.value)} aria-label={t("بحث", "Search")} />
              </div>
              {cards.length === 0 && <p className="admin-empty">{feedback.data.cards.length === 0
                ? t("لا توجد تعليقات بعد.", "No comments yet.") : t("لا نتائج مطابقة.", "No matches.")}</p>}
              {cards.map((card) => (
                <article key={card.cardKey} className="fb-group" data-testid={`feedback-card-${card.cardKey}`}>
                  <div className="fb-kind">{ar ? (KIND[card.kind]?.ar ?? card.kind) : (KIND[card.kind]?.en ?? card.kind)}
                    <span> · {card.comments.length} {t("تعليق", "comments")}</span></div>
                  <CardFrame card={card} css={feedback.data.css} />
                  <ul className="fb-comments">
                    {card.comments.map((c) => (
                      <li key={c.id}>
                        <p className="fb-text">{c.comment}</p>
                        <div className="fb-meta">
                          <strong>{c.name ?? c.email}</strong>
                          {c.userType && <span className="admin-pill admin-ok">{ROLE[c.userType] ? (ar ? ROLE[c.userType].ar : ROLE[c.userType].en) : c.userType}</span>}
                          {c.name && <span dir="ltr">{c.email}</span>}
                          <span>{when(c.createdAt)}</span>
                          {c.context.range && <span className="fb-ctx">{c.context.range}</span>}
                          {c.context.dataThrough && <span className="fb-ctx" dir="ltr">{t("بيانات حتى", "data to")} {c.context.dataThrough}</span>}
                        </div>
                      </li>))}
                  </ul>
                </article>))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
