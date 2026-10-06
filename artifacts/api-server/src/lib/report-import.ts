import { access, mkdtemp, readFile, writeFile, mkdir, copyFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createSynapseClient } from "@noonacademy/synapse-sdk";

export const reportTerm = "2026-08-23";
export const reportJobs = [
  ["01_campuses", ["campuses"]],
  ["02_exams", ["exams", "windows", "bygrade"]],
  ["03_weekly", ["weekly"]],
  ["04_facilitators", ["facilitators"]],
  ["05_students_leads", ["students", "leads", "orphans", "internal_facilitators"]],
  ["06_comments", ["comments"]],
  ["07_sim_grades", ["simgrades"]],
] as const;
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
  const completeWeeks = Math.floor((Date.parse(tomorrow) - Date.parse(reportTerm)) / (7 * 86_400_000));
  const weekEnd = shift(reportTerm, completeWeeks * 7);
  return {
    START: `TIMESTAMP '${reportTerm} 00:00:00'`, END: `TIMESTAMP '${tomorrow} 00:00:00'`,
    DT_FROM: reportTerm.replaceAll("-", ""), DT_TO: today.replaceAll("-", ""),
    TERM: `DATE '${reportTerm}'`, END_WK: `TIMESTAMP '${weekEnd} 00:00:00'`,
    DT_TO_WK: shift(weekEnd, -1).replaceAll("-", ""),
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
  const [name, columns] = job;
  const { SYNAPSE_APP_ID: appId, SYNAPSE_APP_SECRET: appSecret, SYNAPSE_BASE_URL: baseUrl } = process.env;
  if (!appId || !appSecret || !baseUrl) throw new Error("Missing Citadel configuration");
  const source = await sourceDirectory();
  const placeholders = reportPlaceholders(today);
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
      extracted[column] = parsed;
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
    for (const [name, columns] of reportJobs) {
      for (const column of columns) {
        if (!(column in raw)) throw new Error("Incomplete report extract");
      }
      if (name === "05_students_leads") {
        const value = Object.fromEntries(columns.map((column) => [column, raw[column]]));
        await writeFile(join(stage, "data/_raw_students_leads.json"), JSON.stringify(value), { mode: 0o600 });
      } else {
        for (const column of columns) {
          await writeFile(join(stage, "data", "_raw_" + column + ".json"), JSON.stringify(raw[column]), { mode: 0o600 });
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
