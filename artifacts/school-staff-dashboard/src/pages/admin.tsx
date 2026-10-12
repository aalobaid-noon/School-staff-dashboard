import { useState } from "react";
import { Link } from "wouter";
import { Activity, ArrowLeft, Database, Languages, ShieldCheck, Users } from "lucide-react";
import { NoonSignIn } from "@/components/noon-sign-in";
import { Switch } from "@/components/ui/switch";
import { AdminApiError, useAdminOverview, useSetAdminAccess, type AdminOverview } from "@/lib/admin-api";

const STATUS: Record<AdminOverview["health"]["status"], { ar: string; en: string; tone: "ok" | "warn" | "bad" }> = {
  fresh: { ar: "محدّث", en: "Up to date", tone: "ok" },
  stale: { ar: "قديم", en: "Stale", tone: "warn" },
  last_sync_failed: { ar: "آخر مزامنة فشلت", en: "Last sync failed", tone: "bad" },
  no_data: { ar: "لا توجد بيانات", en: "No data yet", tone: "bad" },
};
const RUN_STATE: Record<string, { ar: string; en: string }> = {
  succeeded: { ar: "نجحت", en: "Succeeded" }, failed: { ar: "فشلت", en: "Failed" }, running: { ar: "قيد التنفيذ", en: "Running" },
};

export default function AdminPage() {
  const [language, setLanguage] = useState<"ar" | "en">("ar");
  const ar = language === "ar";
  const t = (arabic: string, english: string) => (ar ? arabic : english);
  const locale = ar ? "ar-EG-u-nu-latn" : "en-US";
  const when = (value: string | null) => value
    ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
  const overview = useAdminOverview();
  const setAccess = useSetAdminAccess();
  const [filter, setFilter] = useState<"all" | "admins" | "others">("all");
  const [newId, setNewId] = useState("");
  const [message, setMessage] = useState("");

  async function change(profileId: number, isAdmin: boolean) {
    setMessage("");
    try {
      await setAccess.mutateAsync({ profileId, isAdmin });
    } catch (failure) {
      setMessage(failure instanceof AdminApiError ? failure.message : t("تعذّر الحفظ.", "Could not save."));
    }
  }

  const data = overview.data;
  const status = data ? STATUS[data.health.status] : null;
  const maxLogins = Math.max(1, ...(data?.usage.daily.map((d) => d.logins) ?? [1]));
  const users = (data?.users ?? []).filter((u) => filter === "all" || (filter === "admins" ? u.isAdmin : !u.isAdmin));

  return (
    <div className={`first-run admin-page ${ar ? "rtl" : ""}`} dir={ar ? "rtl" : "ltr"} lang={language}>
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true"><ShieldCheck size={22} /></div>
          <div>
            <div className="brand-name">noon</div>
            <div className="brand-caption">{t("لوحة الأدمن", "Admin console")}</div>
          </div>
        </div>
        <div className="header-tools">
          <Link className="copy-button" href="/" data-testid="link-admin-home"><ArrowLeft size={14} />{t("الرئيسية", "Home")}</Link>
          <button className="lang-toggle" type="button" onClick={() => setLanguage(ar ? "en" : "ar")}>
            <Languages size={15} strokeWidth={1.8} />{ar ? "English" : "العربية"}
          </button>
        </div>
      </header>

      <main className="page-shell">
        {overview.isPending && <div className="summary-state" role="status">{t("جارٍ التحميل…", "Loading…")}</div>}
        {overview.error && (
          <div className="summary-state" role="alert" data-testid="status-admin-error">
            <strong>
              {overview.error instanceof AdminApiError && overview.error.status === 401
                ? t("سجّل الدخول بحساب Noon أولًا.", "Sign in with Noon first.")
                : overview.error instanceof AdminApiError && overview.error.status === 403
                  ? t("هذه الصفحة للأدمن فقط.", "This page is for admins only.")
                  : t("تعذّر تحميل لوحة الأدمن.", "Could not load the admin console.")}
            </strong>
            <NoonSignIn isArabic={ar} />
          </div>
        )}

        {data && status && (<>
          <section className="workspace-card">
            <div className="card-heading">
              <div className="card-heading-label"><Database className="heading-icon" size={17} strokeWidth={1.8} />
                <span>{t("صحة البيانات", "Data health")}</span></div>
              <span className={`admin-pill admin-${status.tone}`} data-testid="status-data-health">{ar ? status.ar : status.en}</span>
            </div>
            <div className="card-body">
              <div className="metric-grid">
                <div className="metric"><span className="metric-label">{t("آخر مزامنة ناجحة", "Last successful sync")}</span>
                  <span className="admin-small-value">{when(data.health.syncedAt)}</span></div>
                <div className="metric"><span className="metric-label">{t("عمر البيانات", "Data age")}</span>
                  <span className="metric-value">{data.health.ageHours === null ? "—" : `${data.health.ageHours}`}
                    <small className="admin-unit"> {t("ساعة", "h")}</small></span>
                  <span className="admin-note">{t(`يُنبَّه بعد ${data.health.staleAfterHours} ساعة`, `Flagged after ${data.health.staleAfterHours} h`)}</span></div>
                <div className="metric"><span className="metric-label">{t("نافذة البيانات", "Data window")}</span>
                  <span className="admin-small-value">{data.health.windowStart ?? "—"} → {data.health.windowEnd ?? "—"}</span></div>
              </div>
              <h3 className="admin-h">{t("آخر عمليات المزامنة", "Recent sync runs")}</h3>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead><tr><th>{t("الحالة", "State")}</th><th>{t("بدأت", "Started")}</th><th>{t("آخر تحديث", "Updated")}</th><th>{t("الخطوات", "Steps")}</th><th>{t("الخطأ", "Error")}</th></tr></thead>
                  <tbody>
                    {data.health.runs.length === 0 && <tr><td colSpan={5} className="admin-empty">{t("لا توجد عمليات بعد.", "No runs yet.")}</td></tr>}
                    {data.health.runs.map((run) => (
                      <tr key={run.id}>
                        <td><span className={`admin-pill admin-${run.state === "succeeded" ? "ok" : run.state === "failed" ? "bad" : "warn"}`}>
                          {RUN_STATE[run.state] ? (ar ? RUN_STATE[run.state].ar : RUN_STATE[run.state].en) : run.state}</span></td>
                        <td>{when(run.startedAt)}</td><td>{when(run.updatedAt)}</td><td>{run.completedSteps}</td>
                        <td className="admin-error">{run.error ?? "—"}</td>
                      </tr>))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="workspace-card">
            <div className="card-heading">
              <div className="card-heading-label"><Activity className="heading-icon" size={17} strokeWidth={1.8} />
                <span>{t("نشاط الاستخدام", "Usage activity")}</span></div>
              <span className="card-heading-note">{t("يُحسب من تسجيلات الدخول", "Counted from sign-ins")}</span>
            </div>
            <div className="card-body">
              <div className="metric-grid">
                <div className="metric"><span className="metric-label">{t("مستخدمون آخر 7 أيام", "Users, 7 days")}</span><span className="metric-value">{data.usage.users7d}</span></div>
                <div className="metric"><span className="metric-label">{t("تسجيلات دخول 7 أيام", "Sign-ins, 7 days")}</span><span className="metric-value">{data.usage.logins7d}</span></div>
                <div className="metric"><span className="metric-label">{t("مستخدمون آخر 30 يومًا", "Users, 30 days")}</span><span className="metric-value">{data.usage.users30d}</span></div>
                <div className="metric"><span className="metric-label">{t("تسجيلات دخول 30 يومًا", "Sign-ins, 30 days")}</span><span className="metric-value">{data.usage.logins30d}</span></div>
              </div>
              <h3 className="admin-h">{t("آخر 14 يومًا", "Last 14 days")}</h3>
              {data.usage.daily.length === 0 ? <p className="admin-empty">{t("لا توجد تسجيلات دخول بعد.", "No sign-ins recorded yet.")}</p> : (
                <div className="admin-bars" role="img" aria-label={t("تسجيلات الدخول اليومية", "Daily sign-ins")}>
                  {data.usage.daily.map((d) => (
                    <div key={d.day} className="admin-bar" title={`${d.day}: ${d.logins} / ${d.users}`}>
                      <i style={{ height: `${Math.max(6, (d.logins / maxLogins) * 100)}%` }} />
                      <span>{d.day.slice(5)}</span>
                    </div>))}
                </div>)}
              <div className="admin-two">
                <div>
                  <h3 className="admin-h">{t("حسب الدور (30 يومًا)", "By role (30 days)")}</h3>
                  <table className="admin-table"><tbody>
                    {data.usage.byRole.map((r) => <tr key={r.userType}><td>{r.userType}</td><td>{r.users} {t("مستخدم", "users")}</td><td>{r.logins} {t("دخول", "sign-ins")}</td></tr>)}
                    {data.usage.byRole.length === 0 && <tr><td className="admin-empty">—</td></tr>}
                  </tbody></table>
                </div>
                <div>
                  <h3 className="admin-h">{t("آخر تسجيلات الدخول", "Recent sign-ins")}</h3>
                  <table className="admin-table"><tbody>
                    {data.usage.recent.map((r, i) => <tr key={i}><td dir="ltr">{r.email ?? r.profileId}</td><td>{r.userType ?? "—"}</td><td>{when(r.at)}</td></tr>)}
                    {data.usage.recent.length === 0 && <tr><td className="admin-empty">—</td></tr>}
                  </tbody></table>
                </div>
              </div>
            </div>
          </section>

          <section className="workspace-card">
            <div className="card-heading">
              <div className="card-heading-label"><Users className="heading-icon" size={17} strokeWidth={1.8} />
                <span>{t("المستخدمون والصلاحيات", "Users and access")}</span></div>
              <span className="card-heading-note">{data.users.filter((u) => u.isAdmin).length} {t("أدمن", "admins")}</span>
            </div>
            <div className="card-body">
              <div className="admin-toolbar">
                {(["all", "admins", "others"] as const).map((key) => (
                  <button key={key} type="button" className={`copy-button${filter === key ? " admin-active" : ""}`} onClick={() => setFilter(key)}>
                    {key === "all" ? t("الكل", "All") : key === "admins" ? t("الأدمن", "Admins") : t("عاديون", "Regular")}
                  </button>))}
                <form className="admin-add" onSubmit={(event) => {
                  event.preventDefault();
                  const id = Number(newId.trim());
                  if (!Number.isSafeInteger(id) || id <= 0) { setMessage(t("أدخل رقم Profile ID صحيح.", "Enter a valid profile ID.")); return; }
                  void change(id, true).then(() => setNewId(""));
                }}>
                  <input inputMode="numeric" placeholder={t("Profile ID لإضافة أدمن", "Profile ID to add as admin")} value={newId}
                    onChange={(event) => setNewId(event.target.value)} aria-label="Profile ID" />
                  <button className="copy-button" type="submit" disabled={setAccess.isPending}>{t("إضافة", "Add")}</button>
                </form>
              </div>
              {message && <p className="admin-error" role="alert" data-testid="text-admin-message">{message}</p>}
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead><tr><th>{t("أدمن", "Admin")}</th><th>Profile ID</th><th>{t("البريد", "Email")}</th><th>{t("آخر دور", "Last role")}</th><th>{t("آخر دخول", "Last seen")}</th><th>{t("مرات الدخول", "Sign-ins")}</th><th>{t("المصدر", "Source")}</th></tr></thead>
                  <tbody>
                    {users.map((u) => {
                      const self = u.profileId === data.viewer.profileId;
                      return (
                        <tr key={u.profileId}>
                          <td><Switch checked={u.isAdmin} disabled={self || setAccess.isPending}
                            onCheckedChange={(next) => void change(u.profileId, next)}
                            aria-label={`${t("أدمن", "Admin")} ${u.profileId}`} data-testid={`switch-admin-${u.profileId}`} /></td>
                          <td dir="ltr">{u.profileId}{self ? ` (${t("أنت", "you")})` : ""}</td>
                          <td dir="ltr">{u.email ?? "—"}</td><td>{u.lastUserType ?? "—"}</td><td>{when(u.lastSeenAt)}</td><td>{u.loginCount}</td>
                          <td>{u.adminSource === "override" ? t("تعديل يدوي", "Manual") : t("القائمة الأساسية", "Built-in list")}</td>
                        </tr>);
                    })}
                  </tbody>
                </table>
              </div>
              <p className="admin-note">{t(
                "الأدمن يرى كل المدارس. الأشخاص غير المدرجين يظهرون هنا بعد أول تسجيل دخول لهم، أو أضفهم بالـ Profile ID. لا يمكنك تغيير صلاحيتك بنفسك، ولا إزالة آخر أدمن.",
                "Admins see every school. People appear here after their first sign-in, or add them by profile ID. You cannot change your own access or remove the last admin.")}</p>
            </div>
          </section>
        </>)}
      </main>
    </div>
  );
}
