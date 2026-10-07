import assert from "node:assert/strict";
import { filterDashboardReport, getDashboardScope } from "../lib/dashboard-scope";

export function checkDashboardScope() {
  const oldStaff = process.env.DASHBOARD_SCHOOL_STAFF_EMAILS;
  process.env.DASHBOARD_SCHOOL_STAFF_EMAILS = "staff.one@noonacademy.com,staff.two@noonacademy.com";
  try {
  const document = {
    meta: { window_start: "2026-08-23", window_end: "2026-10-07", privateSummary: "hidden-meta" },
    campuses: [{ id: 101, name: "School A", type: "TRACKS", mgr: "7,8", enr: 50, act: 40 },
      { id: 202, name: "School B", type: "TRACKS", mgr: "7", enr: 60, act: 50 },
      { id: 303, name: "School C", type: "TRACKS", mgr: "9", enr: 70, act: 60 }],
    managers: [{ id: 7, name: "Manager A" }, { id: 8, name: "Manager B" }, { id: 9, name: "Manager C" }],
    leads: [{ lid: 10, cid: 101, name: "Lead A" }, { lid: 11, cid: 101, name: "Lead B" },
      { lid: 10, cid: 202, name: "Lead A" }, { lid: 12, cid: 303, name: "Lead C" }],
    facilitators: [{ fid: 20, cid: 101, fname: "Facilitator A", n: 10, act: 8, att: 80 },
      { fid: 21, cid: 101, fname: "Facilitator B", n: 40, act: 32, att: 70 },
      { fid: 20, cid: 202, fname: "Facilitator A", n: 2, act: 1, att: 50 },
      { fid: 22, cid: 303, fname: "Facilitator C", n: 70, act: 60, att: 90 }],
    exams: [{ id: 101 }, { id: 202 }, { id: 303 }],
    weekly: [{ mid: 7, wk: 1, act: 90 }, { mid: 8, wk: 1, act: 999 }, { mid: 9, wk: 1, act: 60 }],
    grades: ["Grade A", "Grade B", "Grade C", "unused-grade"],
    cohorts: ["Class A", "Class B", "Class C", "unused-class"],
    students: [["Student A", 101, 0, 0, 20, 1], ["Student B", 101, 1, 1, 21, 1],
      ["Student C", 303, 2, 2, 22, 1]],
    comments: [[101, 20, 0, 1, "A", 1, "Comment A"], [101, 21, 1, 1, "A", 1, "Comment B"],
      [303, 22, 2, 1, "A", 1, "Comment C"]],
    bygrade: [[101, 0, "q", 10], [202, 1, "q", 20], [303, 2, "q", 30]],
    orphanCohorts: [{ c: 101, k: "Unassigned A" }, { c: 303, k: "Unassigned C" }],
    simgrades: [["global-comparison"]], futurePrivateData: "hidden-future-field",
  };
  const before = JSON.stringify(document);
  const user = (userType: string | null, profileId: number) => ({ userType, profileId, email: "employee@noonacademy.com" });
  assert.equal(filterDashboardReport(user("ADMIN", 999), document), document);
  const manager = filterDashboardReport(user("SCHOOL_MANAGER", 7), document);
  assert.deepEqual(manager.campuses.map((row: any) => row.id), [101, 202]);
  assert.deepEqual(manager.facilitators.map((row: any) => row.fid), [20, 21, 20]);
  assert.deepEqual(manager.managers.map((row: any) => row.id), [7]);
  assert.deepEqual(manager.weekly.map((row: any) => row.mid), [7]);
  assert.deepEqual(manager.exams.map((row: any) => row.id), [101, 202]);
  const lead = filterDashboardReport(user("SCHOOL_LEAD", 10), document);
  assert.deepEqual(lead.campuses.map((row: any) => row.id), [101, 202]);
  assert.deepEqual(lead.leads.map((row: any) => row.lid), [10, 10]);
  assert.deepEqual(lead.facilitators.map((row: any) => row.fid), [20, 21, 20]);
  assert.deepEqual(lead.weekly, []);
  assert.deepEqual(lead.managers, []);
  const facilitator = filterDashboardReport(user("FACILITATOR", 20), document);
  assert.deepEqual(facilitator.campuses.map((row: any) => [row.id, row.enr, row.act]), [[101, 10, 8], [202, 2, 1]]);
  assert.deepEqual(facilitator.facilitators.map((row: any) => row.fid), [20, 20]);
  assert.deepEqual(facilitator.students, [["Student A", 101, 0, 0, 20, 1]]);
  assert.deepEqual(facilitator.comments, [[101, 20, 0, 1, "A", 1, "Comment A"]]);
  assert.deepEqual(facilitator.cohorts, ["Class A"]);
  assert.deepEqual(facilitator.grades, ["Grade A"]);
  for (const key of ["managers", "leads", "weekly", "exams", "bygrade", "orphanCohorts", "simgrades"]) {
    assert.deepEqual(facilitator[key], [], `Facilitator must not receive ${key}`);
  }
  const secondFacilitator = filterDashboardReport(user("FACILITATOR", 21), document);
  assert.deepEqual(secondFacilitator.grades, ["Grade B"]);
  assert.deepEqual(secondFacilitator.cohorts, ["Class B"]);
  assert.deepEqual(secondFacilitator.students[0].slice(2, 4), [0, 0]);
  assert.equal(secondFacilitator.comments[0][2], 0);
  for (const report of [manager, lead, facilitator]) {
    const serialized = JSON.stringify(report);
    for (const secret of ["School C", "Student C", "Comment C", "unused-class", "unused-grade",
      "hidden-meta", "hidden-future-field", "global-comparison"]) assert(!serialized.includes(secret), secret);
  }
  for (const role of [null, "TEACHER", "GUEST", "CLUSTER_MANAGER"]) {
    assert.deepEqual(getDashboardScope(user(role, 7), document).campuses, []);
    assert.deepEqual(filterDashboardReport(user(role, 7), document).students, []);
  }
  for (const role of ["SCHOOL_MANAGER", "SCHOOL_LEAD", "FACILITATOR"]) {
    assert.deepEqual(getDashboardScope(user(role, 999), document).campuses, []);
  }
  assert.equal(JSON.stringify(document), before, "Filtering must not mutate the shared snapshot");
  for (const email of ["staff.one@noonacademy.com", " STAFF.TWO@NOONACADEMY.COM "]) {
    for (const userType of ["ADMIN", "SCHOOL_LEAD", "FACILITATOR", null]) {
      const staff = { email, profileId: 7, userType };
      assert.equal(getDashboardScope(staff, document).isOps, false);
      assert.deepEqual(filterDashboardReport(staff, document).campuses.map((row: any) => row.id), [101, 202]);
      assert.deepEqual(filterDashboardReport({ ...staff, profileId: 999 }, document).students, []);
    }
  }
  for (const invalid of ["", "staff.one@noonacademy.com", "staff.one@noonacademy.com,invalid"]) {
    process.env.DASHBOARD_SCHOOL_STAFF_EMAILS = invalid;
    assert.equal(getDashboardScope(user("ADMIN", 999), document).isOps, false);
    assert.deepEqual(filterDashboardReport(user("ADMIN", 999), document).students, []);
  }
  console.log("Dashboard role scope, shared campuses, personal totals, dictionary isolation, and unknown-role denial: PASS");
  } finally {
    if (oldStaff === undefined) delete process.env.DASHBOARD_SCHOOL_STAFF_EMAILS;
    else process.env.DASHBOARD_SCHOOL_STAFF_EMAILS = oldStaff;
  }
}
