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
          ? "يلزم تسجيل رابط العودة لتفعيل تسجيل الدخول بحساب Noon. لا يتم عرض بيانات الطلاب أو المدارس قبل ذلك."
          : "Noon sign-in requires a registered callback URL. Student and school records are not exposed while this is being configured.")}
      </span>
    </div>
  );
}
