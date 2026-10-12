import { existsSync } from "node:fs";
import path from "node:path";

// Production starts Node at the workspace root; pnpm dev/test scripts run
// from the API package. The bundled entrypoint's depth also varies for tests.
export function resolveDashboardTemplate(cwd = process.cwd()): string {
  const candidates = [
    path.resolve(cwd, "artifacts/school-staff-dashboard/source/src/app.html"),
    path.resolve(cwd, "../school-staff-dashboard/source/src/app.html"),
  ];
  const template = candidates.find((candidate) => existsSync(candidate));
  if (!template) throw new Error("Dashboard report template was not found in the workspace or package layout.");
  return template;
}
