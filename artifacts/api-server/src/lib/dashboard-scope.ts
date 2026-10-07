export type DashboardUser = { email: string; profileId: number; userType?: string | null };
type Row = Record<string, any>;

function rows(document: Row, key: string): Row[] {
  return Array.isArray(document[key]) ? document[key].filter((value: unknown) =>
    value !== null && typeof value === "object" && !Array.isArray(value)) : [];
}
function tuples(document: Row, key: string): any[][] {
  return Array.isArray(document[key]) ? document[key].filter(Array.isArray) : [];
}
function pick(row: Row, keys: string[]): Row {
  return Object.fromEntries(keys.filter((key) => key in row).map((key) => [key, row[key]]));
}

export function getDashboardScope(user: DashboardUser, document: Row) {
  const all = rows(document, "campuses");
  const isOps = user.userType === "ADMIN";
  const related = new Set(
    user.userType === "SCHOOL_LEAD"
      ? rows(document, "leads").filter((lead) => Number(lead.lid) === user.profileId).map((lead) => String(lead.cid))
      : user.userType === "FACILITATOR"
        ? rows(document, "facilitators").filter((facilitator) => Number(facilitator.fid) === user.profileId)
          .map((facilitator) => String(facilitator.cid)) : [],
  );
  return {
    isOps,
    campuses: isOps ? all : all.filter((campus) => user.userType === "SCHOOL_MANAGER"
      ? String(campus.mgr ?? "").split(",").some((id) => id.trim() === String(user.profileId))
      : related.has(String(campus.id))),
  };
}

export function filterDashboardReport(user: DashboardUser, document: Row): Row {
  const { isOps, campuses } = getDashboardScope(user, document);
  if (isOps) return document;
  const personal = user.userType === "FACILITATOR";
  const manager = user.userType === "SCHOOL_MANAGER";
  const ids = new Set(campuses.map((campus) => String(campus.id)));
  const atCampus = (id: unknown) => ids.has(String(id));
  const facilitators = rows(document, "facilitators").filter((row) => atCampus(row.cid) &&
    (!personal || Number(row.fid) === user.profileId));
  const students = tuples(document, "students").filter((row) => atCampus(row[1]) &&
    (!personal || Number(row[4]) === user.profileId)).map((row) => row.slice());
  const comments = tuples(document, "comments").filter((row) => atCampus(row[0]) &&
    (!personal || Number(row[1]) === user.profileId)).map((row) => row.slice());
  const bygrade = personal ? [] : tuples(document, "bygrade").filter((row) => atCampus(row[0])).map((row) => row.slice());
  const grades: unknown[] = [];
  const cohorts: unknown[] = [];
  function remap(source: string, target: unknown[], index: unknown) {
    const values = Array.isArray(document[source]) ? document[source] : [];
    const value = typeof index === "number" && Number.isInteger(index) ? values[index] : undefined;
    if (typeof value !== "string") return -1;
    let next = target.indexOf(value);
    if (next === -1) { next = target.length; target.push(value); }
    return next;
  }
  for (const row of students) {
    row[2] = remap("grades", grades, row[2]);
    row[3] = remap("cohorts", cohorts, row[3]);
  }
  for (const row of comments) row[2] = remap("cohorts", cohorts, row[2]);
  for (const row of bygrade) row[1] = remap("grades", grades, row[1]);
  const scopedCampuses = campuses.map((campus) => {
    if (!personal) return { ...campus, mgr: manager ? String(user.profileId) : "" };
    const own = facilitators.find((row) => String(row.cid) === String(campus.id))!;
    // Campus totals include other facilitators; only personal metrics may reach this profile.
    return { ...pick(campus, ["id", "name", "type"]), mgr: "", facs: 1,
      enr: own.n, act: own.act, never: Math.max(0, own.n - own.act), etc: null,
      ...pick(own, ["att", "etq", "etn", "etqs", "tn", "tr"]) };
  });
  // Use an explicit document shape so new snapshot fields do not bypass access checks.
  return {
    meta: pick(document.meta ?? {}, ["source", "rules_version", "pulled_at", "window_start", "window_end",
      "school_year", "term_start", "weeks", "exam_windows"]),
    managers: manager ? rows(document, "managers").filter((row) => Number(row.id) === user.profileId) : [],
    campuses: scopedCampuses,
    exams: personal ? [] : rows(document, "exams").filter((row) => atCampus(row.id)),
    weekly: manager ? rows(document, "weekly").filter((row) => Number(row.mid) === user.profileId) : [],
    facilitators,
    leads: personal ? [] : rows(document, "leads").filter((row) => atCampus(row.cid) &&
      (manager || Number(row.lid) === user.profileId)),
    bygrade, simgrades: [], grades, cohorts, students, comments,
    orphanCohorts: personal ? [] : rows(document, "orphanCohorts").filter((row) => atCampus(row.c)),
  };
}
