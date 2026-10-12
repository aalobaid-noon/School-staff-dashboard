import { access, mkdtemp, readFile, writeFile, mkdir, copyFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createSynapseClient } from "@noonacademy/synapse-sdk";

export const reportTerm = "2026-08-23";
// [query file, columns it returns, optional date range]. A range job re-runs the campus / facilitator
// query for that window only; its columns are stored under "<column>__<range>".
export type ReportJob = readonly [string, readonly string[], string?];
export const reportRangeKeys = ["week", "lastweek", "mtd", "lastmonth"] as const;
export const reportJobs: readonly ReportJob[] = [
  ["01_campuses", ["campuses"]],
  ["02_exams", ["exams", "windows", "bygrade"]],
  ["03_weekly", ["weekly"]],
  ["04_facilitators", ["facilitators"]],
  ["05_students_leads", ["students", "leads", "orphans", "internal_facilitators", "cluster_managers"]],
  ["06_comments", ["comments"]],
  ["07_sim_grades", ["simgrades"]],
  ...reportRangeKeys.flatMap((range): ReportJob[] => [
    ["01_campuses", ["campuses"], range],
    ["04_facilitators", ["facilitators"], range],
  ]),
];
export const reportTotalSteps = reportJobs.length + 1;
export function reportToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}
function shift(date: string, days: number) {
  return new Date(Date.parse(date + "T00:00:00Z") + days * 86_400_000).toISOString().slice(0, 10);
}
export function reportPlaceholders(today: string): Record<string, string> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || !Number.isFinite(Date.parse(today)) || today < reportTerm) {
    throw new Error("Invalid report window");
  }
  const tomorrow = shift(today, 1);
  // The weekly series runs through today, so the current week is included even when partial.
  const weekEnd = tomorrow;
  return {
    START: `TIMESTAMP '${reportTerm} 00:00:00'`, END: `TIMESTAMP '${tomorrow} 00:00:00'`,
    DT_FROM: reportTerm.replaceAll("-", ""), DT_TO: today.replaceAll("-", ""),
    TERM: `DATE '${reportTerm}'`, END_WK: `TIMESTAMP '${weekEnd} 00:00:00'`,
    DT_TO_WK: shift(weekEnd, -1).replaceAll("-", ""),
  };
}
export type ReportRange = { from: string; to: string };
// Date ranges the dashboard can switch between, inclusive of both ends. Term weeks run Sunday-Saturday
// from the term start; a range that falls wholly before the term is left out. Mirrors range_windows()
// in athena_pull.py.
export function reportRanges(today: string): Record<string, ReportRange> {
  const dayDiff = Math.floor((Date.parse(today) - Date.parse(reportTerm)) / 86_400_000);
  const weekStart = shift(reportTerm, 7 * Math.floor(dayDiff / 7));
  const first = today.slice(0, 8) + "01";
  const previousLast = shift(first, -1);
  const clamp = (day: string) => (day < reportTerm ? reportTerm : day);
  const spans: Record<string, ReportRange> = {
    week: { from: weekStart, to: today },
    lastweek: { from: shift(weekStart, -7), to: shift(weekStart, -1) },
    mtd: { from: clamp(first), to: today },
    lastmonth: { from: clamp(previousLast.slice(0, 8) + "01"), to: previousLast },
    term: { from: reportTerm, to: today },
  };
  return Object.fromEntries(Object.entries(spans).filter(([, span]) => span.from >= reportTerm && span.to >= span.from));
}
export function reportRangePlaceholders(today: string, range: ReportRange): Record<string, string> {
  const end = `TIMESTAMP '${shift(range.to, 1)} 00:00:00'`;
  const dt = (day: string) => day.replaceAll("-", "");
  return {
    ...reportPlaceholders(today), START: `TIMESTAMP '${range.from} 00:00:00'`, END: end, END_WK: end,
    DT_FROM: dt(range.from), DT_TO: dt(range.to), DT_TO_WK: dt(range.to),
  };
}
async function sourceDirectory() {
  // Both the server bundle (dist/) and CLI bundle (dist/scripts/) use this module.
  for (const relative of ["../../school-staff-dashboard/source/", "../../../school-staff-dashboard/source/"]) {
    const path = fileURLToPath(new URL(relative, import.meta.url));
    try { await access(join(path, "queries/00_common.sql")); return path; } catch { /* try bundle location */ }
  }
  throw new Error("Original reporting source is unavailable");
}
export async function fetchReportStep(step: number, today: string): Promise<Record<string, unknown>> {
  const job = reportJobs[step];
  if (!job) throw new Error("Invalid report step");
  const [name, columns, rangeKey] = job;
  const rangeSuffix = rangeKey ? "__" + rangeKey : "";
  const range = rangeKey ? reportRanges(today)[rangeKey] : undefined;
  // A range that does not exist yet (e.g. last week during the first term week) needs no query.
  if (rangeKey && !range) return Object.fromEntries(columns.map((column) => [column + rangeSuffix, []]));
  const { SYNAPSE_APP_ID: appId, SYNAPSE_APP_SECRET: appSecret, SYNAPSE_BASE_URL: baseUrl } = process.env;
  if (!appId || !appSecret || !baseUrl) throw new Error("Missing Citadel configuration");
  const source = await sourceDirectory();
  const placeholders = range ? reportRangePlaceholders(today, range) : reportPlaceholders(today);
  const common = await readFile(join(source, "queries/00_common.sql"), "utf8");
  const suffix = (await readFile(join(source, "queries", name + ".sql"), "utf8"))
    .replace(/,\s*ARRAY_JOIN\(REPEAT\(ARRAY_JOIN\(REPEAT\('\.', 10000\), ''\), 12\), ''\) AS spill_pad/, "");
  const sql = (name === "07_sim_grades" ? suffix : common + "\n" + suffix)
    .replace(/\{\{([A-Z_]+)\}\}/g, (_, key: string) => {
      if (!(key in placeholders)) throw new Error("Unknown query placeholder");
      return placeholders[key];
    });
  const client = createSynapseClient({ appId, appSecret, baseUrl, requestTimeoutMs: 180_000, heartbeat: { enabled: false } });
  try {
    const page = await client.athenaQuery({ sql, maxRows: 2, context: `school-dashboard:${name}` });
    if (page.rows.length !== 1 || page.nextToken) throw new Error("Incomplete report response");
    const extracted: Record<string, unknown> = {};
    for (const column of columns) {
      if (!(column in page.rows[0])) throw new Error("Missing report column");
      const value = page.rows[0][column];
      const parsed: unknown = value === null ? [] : JSON.parse(value);
      if (parsed === null || typeof parsed !== "object") throw new Error("Invalid report JSON");
      extracted[column + rangeSuffix] = parsed;
    }
    return extracted;
  } finally {
    client.close();
  }
}
export async function assembleReport(raw: Record<string, unknown>, today: string): Promise<Record<string, unknown>> {
  reportPlaceholders(today);
  const source = await sourceDirectory();
  const stage = await mkdtemp(join(tmpdir(), "school-report-sync-"));
  try {
    await mkdir(join(stage, "data"));
    await mkdir(join(stage, "src"));
    for (const filename of await readdir(source)) {
      if (filename.endsWith(".py")) await copyFile(join(source, filename), join(stage, filename));
    }
    await copyFile(join(source, "src/app.html"), join(stage, "src/app.html"));
    await writeFile(join(stage, "data/_ranges.json"), JSON.stringify(reportRanges(today)), { mode: 0o600 });
    for (const [name, columns, rangeKey] of reportJobs) {
      const suffix = rangeKey ? "__" + rangeKey : "";
      for (const column of columns) {
        if (!((column + suffix) in raw)) throw new Error("Incomplete report extract");
      }
      if (name === "05_students_leads") {
        const value = Object.fromEntries(columns.map((column) => [column, raw[column]]));
        await writeFile(join(stage, "data/_raw_students_leads.json"), JSON.stringify(value), { mode: 0o600 });
      } else {
        for (const column of columns) {
          await writeFile(join(stage, "data", "_raw_" + column + suffix + ".json"), JSON.stringify(raw[column + suffix]), { mode: 0o600 });
        }
      }
    }
    await promisify(execFile)("python3", [
      "refresh.py", "--term", reportTerm, "--window", reportTerm, today, "--rules", "rules-29acaca6df81",
    ], { cwd: stage, maxBuffer: 2_000_000, timeout: 120_000 });
    const document = JSON.parse(await readFile(join(stage, "data/real.json"), "utf8")) as Record<string, unknown>;
    if (!Array.isArray(document.campuses) || !document.campuses.length || !document.meta) {
      throw new Error("Invalid assembled report");
    }
    return document;
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}
