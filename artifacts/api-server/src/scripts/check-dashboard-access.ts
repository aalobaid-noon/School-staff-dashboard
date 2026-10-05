import assert from "node:assert/strict";
import { getDashboardScope } from "../routes/dashboard-auth";

// Fixtures are synthetic; no source school or person record is read by this check.
const document = { campuses: [
  { id: 101, mgr: "7,8" },
  { id: 202, mgr: "9" },
] };
const manager = getDashboardScope({ email: "manager@example.invalid", profileId: 7 }, document);
assert.equal(manager.isOps, false);
assert.deepEqual(manager.campuses.map((campus) => (campus as { id: number }).id), [101]);
const unrelated = getDashboardScope({ email: "other@example.invalid", profileId: 10 }, document);
assert.deepEqual(unrelated.campuses, []);

process.env.DASHBOARD_OPS_EMAILS = "ops@example.invalid";
const operations = getDashboardScope({ email: "ops@example.invalid", profileId: 10 }, document);
assert.equal(operations.isOps, true);
assert.equal(operations.campuses.length, 2);
console.log("Dashboard access isolation: PASS");
