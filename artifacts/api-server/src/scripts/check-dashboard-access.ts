import assert from "node:assert/strict";
import { dashboardPostLoginPath, getDashboardScope, verifiedCitadelUserType } from "../routes/dashboard-auth";
import { dashboardCookies } from "../lib/dashboard-cookies";
import { checkDashboardSyncRoutes } from "./check-dashboard-sync";
import { checkDashboardAuthRoles } from "./check-dashboard-auth-roles";

const previewCookies = dashboardCookies(true);
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

// Fixtures are synthetic; no source school or person record is read by this check.
process.env.DASHBOARD_SCHOOL_STAFF_EMAILS = "staff.one@noonacademy.com,staff.two@noonacademy.com";
const document = { campuses: [
  { id: 101, mgr: "7,8" },
  { id: 202, mgr: "9" },
] };
const manager = getDashboardScope({ email: "manager@example.invalid", profileId: 7 }, document);
assert.equal(manager.isOps, false);
assert.deepEqual(manager.campuses.map((campus) => (campus as { id: number }).id), [101]);
const unrelated = getDashboardScope({ email: "other@example.invalid", profileId: 10 }, document);
assert.deepEqual(unrelated.campuses, []);
assert.equal(verifiedCitadelUserType({ userType: "ADMIN" }), "ADMIN");
assert.equal(verifiedCitadelUserType({ userType: "Admin" }), "ADMIN");
assert.equal(verifiedCitadelUserType({ userType: "SCHOOL_MANAGER" }), "SCHOOL_MANAGER");
assert.equal(verifiedCitadelUserType({ role: "ADMIN" }), null);
assert.equal(verifiedCitadelUserType({ userType: { role: "ADMIN" } }), null);
const admin = getDashboardScope({ email: "new-admin@example.invalid", profileId: 999,
  userType: verifiedCitadelUserType({ userType: "ADMIN" }) }, document);
assert.equal(admin.isOps, true);
assert.equal(admin.campuses.length, 2);
const legacy = getDashboardScope({ email: "legacy@example.invalid", profileId: 999, userType: null }, document);
assert.equal(legacy.isOps, false);
assert.equal(legacy.campuses.length, 0);
const nonAdmin = getDashboardScope({ email: "teacher@example.invalid", profileId: 999, userType: "TEACHER" }, document);
assert.equal(nonAdmin.campuses.length, 0);
for (const userType of [null, "SCHOOL_MANAGER", "TEACHER", "ADMIN"]) {
  const domainAdmin = getDashboardScope({ email: "verified.employee@noonacademy.com", profileId: 999, userType }, document);
  assert.equal(domainAdmin.isOps, true);
  assert.equal(domainAdmin.campuses.length, 2);
}
assert.equal(getDashboardScope({ email: " Verified.Employee@NOONACADEMY.COM ", profileId: 999 }, document).isOps, true);
for (const email of ["employee@noonacademy.com.evil.invalid", "employee@notnoonacademy.com", "fake@other@noonacademy.com"]) {
  assert.equal(getDashboardScope({ email, profileId: 999 }, document).isOps, false);
}
process.env.DASHBOARD_OPS_EMAILS = "staff.one@noonacademy.com,staff.two@noonacademy.com";
for (const email of ["staff.one@noonacademy.com", "STAFF.TWO@NOONACADEMY.COM"]) {
  const staff = getDashboardScope({ email, profileId: 7, userType: "ADMIN" }, document);
  assert.equal(staff.isOps, false);
  assert.deepEqual(staff.campuses.map((campus) => (campus as { id: number }).id), [101]);
  assert.equal(getDashboardScope({ email, profileId: 999, userType: "ADMIN" }, document).campuses.length, 0);
}
for (const invalid of ["", "staff.one@noonacademy.com", "staff.one@noonacademy.com,invalid"]) {
  process.env.DASHBOARD_SCHOOL_STAFF_EMAILS = invalid;
  assert.equal(getDashboardScope({ email: "employee@noonacademy.com", profileId: 999, userType: "ADMIN" }, document).isOps, false);
  assert.equal(getDashboardScope({ email: "staff.one@noonacademy.com", profileId: 999, userType: "ADMIN" }, document).isOps, false);
}
process.env.DASHBOARD_SCHOOL_STAFF_EMAILS = "staff.one@noonacademy.com,staff.two@noonacademy.com";

process.env.DASHBOARD_OPS_EMAILS = "ops@example.invalid";
const operations = getDashboardScope({ email: "ops@example.invalid", profileId: 10 }, document);
assert.equal(operations.isOps, true);
assert.equal(operations.campuses.length, 2);
console.log("Dashboard cookie policy and access isolation: PASS");
await checkDashboardAuthRoles();
await checkDashboardSyncRoutes();
