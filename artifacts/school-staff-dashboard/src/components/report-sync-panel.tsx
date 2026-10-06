import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  advanceDashboardSync, startDashboardSync, useGetDashboardSync, getGetDashboardSummaryQueryKey,
  getGetDashboardSyncQueryKey, ApiError,
  type DashboardSyncRun,
} from "@workspace/api-client-react";
import { RefreshCw, ShieldCheck, FileText } from "lucide-react";

export function ReportSyncPanel({ isArabic }: { isArabic: boolean }) {
  const queryClient = useQueryClient();
  const status = useGetDashboardSync({ query: { queryKey: getGetDashboardSyncQueryKey(),
    retry: false, staleTime: 15_000, refetchInterval: 15_000 } });
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<DashboardSyncRun | null>(null);
  const [error, setError] = useState("");
  const data = status.data;
  const run = busy ? progress ?? data : data;

  async function sync() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const options = { headers: { "X-Dashboard-Sync": "1" } };
      let current = await startDashboardSync(options);
      setProgress(current);
      while (current.state === "running" && current.runId) {
        current = await advanceDashboardSync({ runId: current.runId }, options);
        setProgress(current);
      }
      if (current.state !== "succeeded") throw new Error("Import failed");
      await queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
      await status.refetch();
      // The report endpoint resolves the session's school scope again, server-side.
      window.location.assign("/api/dashboard/report");
    } catch (failure) {
      const code = failure instanceof ApiError ? failure.status : undefined;
      setError(code === 401
        ? (isArabic ? "انتهت الجلسة. سجّل الدخول مجددًا." : "Your session expired. Sign in again.")
        : code === 403
          ? (isArabic ? "ليس لهذا الحساب صلاحية مزامنة التقارير." : "This account cannot sync reports.")
          : code === 429
            ? (isArabic ? "انتظر دقيقة قبل بدء مزامنة جديدة." : "Wait one minute before starting another sync.")
            : (isArabic
              ? "لم تكتمل المزامنة. يمكنك إعادة المحاولة أو متابعة المزامنة؛ التقرير السابق لم يتغير."
              : "Sync did not finish. Retry or resume below; any previous report is unchanged."));
      await status.refetch();
    } finally {
      setBusy(false);
    }
  }

  if (status.isError) {
    if (status.error instanceof ApiError && status.error.status === 401) return null;
    return <div className="report-sync-panel" role="alert">
      <p>{isArabic ? "تعذّر التحقق من حالة المزامنة." : "Unable to check sync status."}</p>
      <button className="copy-button" onClick={() => status.refetch()} type="button">
        {isArabic ? "إعادة المحاولة" : "Retry sync status"}
      </button>
    </div>;
  }
  if (!data) return null;
  return (
    <section className="report-sync-panel" aria-label={isArabic ? "صلاحيات الحساب ومزامنة التقارير" : "Account access and report sync"}
      data-testid="section-report-sync">
      <div className="access-lock" data-testid="text-locked-role">
        <ShieldCheck size={17} />
        <strong>{data.accessRole === "central_operations"
          ? (isArabic ? "العمليات المركزية · صلاحيات مثبتة" : "Central operations · Access locked")
          : (isArabic ? "المدارس المعيّنة لحسابك فقط · صلاحيات مثبتة" : "Assigned schools only · Access locked")}</strong>
      </div>
      <p>{isArabic ? "تُحدَّد الصلاحيات على الخادم من حساب Noon؛ لا يمكن تغيير الدور من الصفحة."
        : "Access is assigned on the server from your Noon account; it cannot be changed on this page."}</p>
      {data.canSync ? (
        <>
          <p>{isArabic
            ? "استيراد التقارير من Citadel إلى هذه البيئة. تُنشر البيانات فقط بعد اكتمال جميع الخطوات والتحقق منها. أبقِ الصفحة مفتوحة أثناء المزامنة؛ يمكنك المتابعة إذا انقطعت."
            : "Import reports from Citadel into this environment. Data is published only after every step validates. Keep this page open while syncing; you can resume if interrupted."}</p>
          <button className="copy-button gate-link" type="button" onClick={sync} disabled={busy} data-testid="button-sync-report">
            <RefreshCw size={15} className={busy ? "sync-spinning" : ""} />
            {busy ? (isArabic ? "جارٍ مزامنة التقارير…" : "Syncing reports…")
              : data.state === "running" ? (isArabic ? "متابعة المزامنة" : "Resume sync")
                : (isArabic ? "مزامنة بيانات التقارير" : "Sync report data")}
          </button>
        </>
      ) : !data.snapshotAvailable ? (
        <p>{isArabic ? "يلزم أن تقوم العمليات المركزية بمزامنة التقارير أولًا. بعدها ستظهر بيانات مدارسك فقط."
          : "Central operations must sync reports first. Afterwards, only your assigned schools will be available."}</p>
      ) : null}
      {run?.state === "running" && (
        <div role="status" aria-live="polite" data-testid="status-report-sync-progress">
          <progress max={run.totalSteps} value={run.completedSteps} />
          <span>{isArabic ? "الخطوات المكتملة" : "Completed steps"}: {run.completedSteps} / {run.totalSteps}</span>
        </div>
      )}
      {(error || data.state === "failed") && (
        <p role="alert" data-testid="status-report-sync-error">{error || (isArabic
          ? "فشلت المزامنة السابقة. لم يُنشر تقرير جديد، والتقرير السابق لم يتغير."
          : data.error)}</p>
      )}
      {data.snapshotAvailable && (
        <a href="/api/dashboard/report" target="_self" className="copy-button gate-link" data-testid="link-scoped-dashboard">
          <FileText size={15} />{isArabic ? "فتح لوحة مدارسي" : "Open my dashboard"}
        </a>
      )}
    </section>
  );
}
