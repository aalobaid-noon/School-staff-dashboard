import { checkDashboardSummary } from "./check-dashboard-summary";
import { checkDashboardScope } from "./check-dashboard-scope";
import assert from "node:assert/strict";
import path from "node:path";
import { existsSync } from "node:fs";
import { resolveDashboardTemplate } from "../lib/dashboard-template";
import { dashboardPostLoginPath, verifiedCitadelUserType } from "../routes/dashboard-auth";
import { dashboardCookies } from "../lib/dashboard-cookies";
import { checkDashboardSyncRoutes } from "./check-dashboard-sync";
import { checkDashboardAuthRoles } from "./check-dashboard-auth-roles";

const previewCookies = dashboardCookies(true);
const template = resolveDashboardTemplate();
assert(existsSync(template));
const workspaceRoot = path.resolve(template, "../../../../..");
const packageRoot = path.join(workspaceRoot, "artifacts/api-server");
assert.equal(resolveDashboardTemplate(workspaceRoot), template);
assert.equal(resolveDashboardTemplate(packageRoot), template);
assert.throws(() => resolveDashboardTemplate("/nonexistent-dashboard-fixture"), /template was not found/);
const productionCookies = dashboardCookies(false);
for (const options of [previewCookies.sessionOptions, previewCookies.stateOptions]) {
  assert.equal(options.sameSite, "none");
  assert.equal(options.partitioned, undefined);
  assert.equal(options.secure, true);
  assert.equal(options.httpOnly, true);
}
for (const options of [productionCookies.sessionOptions, productionCookies.stateOptions]) {
  assert.equal(options.sameSite, "none");
  assert.equal(options.partitioned, undefined);
  assert.equal(options.secure, true);
  assert.equal(options.httpOnly, true);
}
assert.equal(previewCookies.stateOptions.path, "/");
assert.equal(productionCookies.stateOptions.path, "/");
assert.equal(previewCookies.sessionOptions.path, "/api/dashboard");
assert.equal(productionCookies.sessionOptions.path, "/api/dashboard");
assert.notEqual(previewCookies.sessionName, productionCookies.sessionName);
assert.notEqual(previewCookies.stateName, productionCookies.stateName);
assert.equal(dashboardPostLoginPath(false), "/");
assert.equal(dashboardPostLoginPath(true), "/api/dashboard/report");

assert.equal(verifiedCitadelUserType({ userType: "Admin" }), "ADMIN");
assert.equal(verifiedCitadelUserType({ role: "ADMIN" }), null);
assert.equal(verifiedCitadelUserType({ userType: { role: "ADMIN" } }), null);
console.log("Dashboard cookie policy: PASS");
await checkDashboardAuthRoles();
await checkDashboardSyncRoutes();
checkDashboardScope();
await checkDashboardSummary();
