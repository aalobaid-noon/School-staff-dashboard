import { getGetDashboardSummaryQueryKey, useGetDashboardSummary } from "@workspace/api-client-react";
import { Building2, GraduationCap, LockKeyhole, LogIn, FileText, ShieldCheck, RefreshCw, Users, UserCog, Handshake } from "lucide-react";

export function SummaryPanel({ isArabic }: { isArabic: boolean }) {
  const { data, isPending, isError, refetch, isFetching } = useGetDashboardSummary({
    query: { queryKey: getGetDashboardSummaryQueryKey(), staleTime: 30_000, refetchInterval: 60_000, retry: 1 },
  });
  const locale = isArabic ? "ar-EG-u-nu-latn" : "en-US";
  const num = new Intl.NumberFormat(locale);
  const fmt = (v: string | null | undefined, time = false) => {
    if (!v) return "—";
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat(locale, time ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }).format(d);
  };
  const m = data?.available ? data.metrics : null;
  const items = [
    { k: "schools", icon: Building2, ar: "المدارس", en: "Schools", v: m?.schools },
    { k: "students", icon: GraduationCap, ar: "الطلاب المسجلون", en: "Enrolled students", v: m?.enrolledStudents },
    { k: "managers", icon: UserCog, ar: "المديرون", en: "Managers", v: m?.managers },
    { k: "leads", icon: Users, ar: "قادة المدارس", en: "School leads", v: m?.schoolLeads },
    { k: "facilitators", icon: Handshake, ar: "الميسّرون", en: "Facilitators", v: m?.facilitators },
  ];

  if (isError) {
    return (
      <div className="summary-state" role="alert" data-testid="status-summary-error">
        <strong>{isArabic ? "تعذّر تحميل ملخص التقارير." : "Unable to load the reporting summary."}</strong>
        <button className="copy-button" type="button" onClick={() => refetch()} data-testid="button-retry-summary">
          <RefreshCw size={14} />
          {isArabic ? "إعادة المحاولة" : "Retry"}
        </button>
      </div>
    );
  }

  if (isPending) {
    return (
      <div className="summary-state" role="status" data-testid="status-summary-loading">
        <strong>{isArabic ? "جارٍ التحقق من حالة الجلسة…" : "Checking session status…"}</strong>
      </div>
    );
  }

  if (!data.available) {
    const synced = data.authRequired && !!data.syncedAt;
    return (
      <div data-testid="section-summary">
        {synced ? (
          <div className="gate" data-testid="status-auth-required">
            <ShieldCheck size={22} strokeWidth={1.8} className="heading-icon" aria-hidden="true" />
            <h2>{isArabic ? "تم حفظ المستخرج والتحقق منه. لوحة التفاصيل محمية." : "The extract is stored and validated. The detailed dashboard is protected."}</h2>
            <p>
              {isArabic
                ? "لا تُعرض أي أرقام قبل تسجيل الدخول. سجّل الدخول بحساب Noon لعرض بيانات مدارسك فقط."
                : "No figures are shown before sign-in. Sign in with your Noon account to see data for your own schools only."}
              {" "}
              <bdi>{isArabic ? "آخر مزامنة" : "Last synced"} {fmt(data.syncedAt, true)}</bdi>
            </p>
            <a className="copy-button gate-link" href="/api/dashboard/login" target="_blank" rel="noopener noreferrer" data-testid="link-signin-noon">
              <LogIn size={15} />
              {isArabic ? "تسجيل الدخول عبر Noon" : "Sign in with Noon"}
            </a>
            <p className="gate-note">
              {isArabic
                ? "يفتح تسجيل الدخول في تبويب جديد لتجنّب قيود ملفات الارتباط داخل المعاينة."
                : "Sign-in opens in a new tab to avoid embedded-preview cookie restrictions."}
            </p>
          </div>
        ) : (
          <div className="summary-state" data-testid="status-summary-unavailable">
            <strong>{isArabic ? "لم تتم مزامنة البيانات بعد. لا تُعرض أي أرقام." : "Data has not been synced yet. No figures are shown."}</strong>
          </div>
        )}
        <div className="privacy-note" data-testid="text-private-data-notice">
          <LockKeyhole size={15} strokeWidth={1.8} />
          <span>{isArabic ? "لا تُعرض أسماء المدارس أو المديرين أو الطلاب لأي زائر غير مسجّل." : "No school, manager or student names are shown to anonymous visitors."}</span>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="section-summary">
      <div className="window-line" data-testid="text-date-window">
        <span>{isArabic ? "فترة التقرير" : "Reporting window"}</span>
        <bdi>{`${fmt(data.windowStart)} – ${fmt(data.windowEnd)}`}</bdi>
        <span className="window-sync">
          {isArabic ? "آخر مزامنة" : "Last synced"} <bdi>{fmt(data.syncedAt, true)}</bdi>
          {isFetching ? " ·" : ""}
        </span>
      </div>
      <div className="metric-grid">
        {items.map((i, idx) => (
          <div className={`metric ${idx === 0 ? "metric-lead" : ""}`} key={i.k} data-testid={`card-metric-${i.k}`}>
            <i.icon size={17} strokeWidth={1.8} className="heading-icon" aria-hidden="true" />
            <div className="metric-label">{isArabic ? i.ar : i.en}</div>
            {(
              <div className="metric-value" data-testid={`text-metric-${i.k}`}>{i.v === undefined || i.v === null ? "—" : num.format(i.v)}</div>
            )}
          </div>
        ))}
      </div>
      <div className="privacy-note" data-testid="text-scope-notice">
        <LockKeyhole size={15} strokeWidth={1.8} />
        <span>{isArabic ? "الأرقام أعلاه تخص مدارسك فقط، حسب صلاحياتك." : "The figures above cover your own schools only, based on your access."}</span>
      </div>
      <a className="copy-button gate-link" href="/api/dashboard/report" data-testid="link-detailed-report">
        <FileText size={15} />
        {isArabic ? "فتح لوحة التفاصيل" : "Open the detailed dashboard"}
      </a>
    </div>
  );
}
