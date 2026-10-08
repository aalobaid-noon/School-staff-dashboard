import { getGetSynapseStatusQueryKey, useGetSynapseStatus } from "@workspace/api-client-react";
import { Database } from "lucide-react";

export function SynapseConnection({ isArabic }: { isArabic: boolean }) {
  const { data, isPending, isError } = useGetSynapseStatus({
    query: { queryKey: getGetSynapseStatusQueryKey(), staleTime: 30_000, refetchInterval: 60_000, retry: 1 },
  });
  const status = isPending
    ? (isArabic ? "جارٍ التحقق من الاتصال بـ Synapse…" : "Checking the Synapse connection…")
    : isError
      ? (isArabic ? "تعذّر التحقق من اتصال Synapse." : "Unable to check the Synapse connection.")
      : data?.connected
        ? (isArabic ? "Synapse متصل بـ Citadel." : "Synapse is connected to Citadel.")
        : (isArabic ? "Synapse غير متصل. راجع إعدادات الاتصال." : "Synapse is not connected. Check the connection settings.");

  return (
    <div className="privacy-note" role="status" data-testid="status-synapse-connection">
      <Database size={15} strokeWidth={1.8} aria-hidden="true" />
      <span>
        <strong>{status}</strong>{" "}
        {data?.connected && (isArabic
          ? "لا تُعرض تفاصيل المدارس أو الطلاب إلا بعد تسجيل الدخول بحساب Noon والتحقق من الصلاحيات."
          : "School and student details are shown only after verified Noon sign-in and access checks.")}
      </span>
    </div>
  );
}
