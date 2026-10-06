import { LogIn } from "lucide-react";

export function NoonSignIn({ isArabic, compact = false }: { isArabic: boolean; compact?: boolean }) {
  const button = (
    <a className={`copy-button gate-link${compact ? " header-signin" : ""}`}
      href="/api/dashboard/login" target="_self"
      data-testid={compact ? "link-header-signin-noon" : "link-signin-noon"}>
      <LogIn size={15} />
      {isArabic ? "تسجيل الدخول عبر Noon" : "Sign in with Noon"}
    </a>
  );
  if (compact) return button;
  return (
    <div>
      {button}
      <p className="gate-note">
        {isArabic
          ? "يبقى تسجيل الدخول والعودة إلى التقرير داخل النافذة نفسها."
          : "Sign-in and the return to your report stay in this window."}
      </p>
    </div>
  );
}
