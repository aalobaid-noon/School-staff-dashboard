import type { CookieOptions } from "express";

export function dashboardCookies(development: boolean) {
  // Either environment can be displayed inside a cross-site preview frame.
  // Keep cookies Secure and HttpOnly, with separate names per environment.
  const common: CookieOptions = {
    httpOnly: true,
    secure: true,
    sameSite: "none",
  };
  return {
    sessionName: development ? "school_dashboard_preview_session" : "school_dashboard_session",
    stateName: development ? "school_dashboard_preview_oauth_state" : "school_dashboard_oauth_state",
    sessionOptions: { ...common, path: "/api/dashboard" },
    stateOptions: { ...common, path: "/" },
  };
}
