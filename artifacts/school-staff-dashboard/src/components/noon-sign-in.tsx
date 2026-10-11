import { LogIn } from "lucide-react";

export function NoonSignIn({ isArabic, compact = false }: { isArabic: boolean; compact?: boolean }) {
  const button = (
    <a className={`copy-button gate-link${compact ? " header-signin" : ""}`}
      href="/api/dashboard/login?start=1" target="_blank" rel="noopener noreferrer"
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
          ? "يفتح تسجيل الدخول والتقرير في علامة تبويب جديدة."
          : "Sign-in and your report open in a new tab."}
      </p>
    </div>
  );
}
