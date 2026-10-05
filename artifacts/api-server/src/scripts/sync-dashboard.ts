import { mkdtemp, readFile, writeFile, mkdir, copyFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { pool } from "@workspace/db";
import { createSynapseClient } from "@noonacademy/synapse-sdk";

const source = fileURLToPath(new URL("../../../school-staff-dashboard/source/", import.meta.url));
const term = "2026-08-23";
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());
function shift(date: string, days: number) {
  return new Date(Date.parse(date + "T00:00:00Z") + days * 86_400_000).toISOString().slice(0, 10);
}
const tomorrow = shift(today, 1);
const completeWeeks = Math.floor((Date.parse(tomorrow) - Date.parse(term)) / (7 * 86_400_000));
const weekEnd = shift(term, completeWeeks * 7);
const placeholders: Record<string, string> = {
  START: `TIMESTAMP '${term} 00:00:00'`, END: `TIMESTAMP '${tomorrow} 00:00:00'`,
  DT_FROM: term.replaceAll("-", ""), DT_TO: today.replaceAll("-", ""),
  TERM: `DATE '${term}'`, END_WK: `TIMESTAMP '${weekEnd} 00:00:00'`,
  DT_TO_WK: shift(weekEnd, -1).replaceAll("-", ""),
};
const jobs = [
  ["01_campuses", ["campuses"]],
  ["02_exams", ["exams", "windows", "bygrade"]],
  ["03_weekly", ["weekly"]],
  ["04_facilitators", ["facilitators"]],
  ["05_students_leads", ["students", "leads", "orphans", "internal_facilitators"]],
  ["06_comments", ["comments"]],
  ["07_sim_grades", ["simgrades"]],
] as const;

let client: ReturnType<typeof createSynapseClient> | undefined;
let stage: string | undefined;
let currentJob = "configuration";
let phase = "setup";
try {
  const { SYNAPSE_APP_ID: appId, SYNAPSE_APP_SECRET: appSecret, SYNAPSE_BASE_URL: baseUrl } = process.env;
  if (!appId || !appSecret || !baseUrl) throw new Error("Missing Citadel configuration.");
  client = createSynapseClient({ appId, appSecret, baseUrl, requestTimeoutMs: 180_000, heartbeat: { enabled: false } });
  stage = await mkdtemp(join(tmpdir(), "school-report-sync-"));
  await mkdir(join(stage, "data"));
  await mkdir(join(stage, "src"));
  for (const filename of await readdir(source)) {
    if (filename.endsWith(".py")) await copyFile(join(source, filename), join(stage, filename));
  }
  await copyFile(join(source, "src/app.html"), join(stage, "src/app.html"));
  const common = await readFile(join(source, "queries/00_common.sql"), "utf8");
  for (const [name, columns] of jobs) {
    currentJob = name;
    phase = "query";
    console.log(`[report-sync] Fetching ${name} through the Citadel SDK.`);
    const suffix = (await readFile(join(source, "queries", name + ".sql"), "utf8"))
      .replace(/,\s*ARRAY_JOIN\(REPEAT\(ARRAY_JOIN\(REPEAT\('\.', 10000\), ''\), 12\), ''\) AS spill_pad/, "");
    const sql = (name === "07_sim_grades" ? suffix : common + "\n" + suffix)
      .replace(/\{\{([A-Z_]+)\}\}/g, (_, key: string) => {
      if (!(key in placeholders)) throw new Error("Unknown query placeholder.");
      return placeholders[key];
    });
    const page = await client.athenaQuery({ sql, maxRows: 2, context: `school-dashboard:${name}` });
    phase = "validate page";
    if (page.rows.length !== 1 || page.nextToken) throw new Error("Expected exactly one complete JSON row.");
    phase = "parse JSON";
    const extracted: Record<string, unknown> = {};
    for (const column of columns) {
      const value = page.rows[0][column];
      if (!(column in page.rows[0])) throw new Error(`Required report column missing: ${column}`);
      const parsed: unknown = value === null ? [] : JSON.parse(value);
      if (parsed === null || typeof parsed !== "object") throw new Error("Invalid report JSON.");
      extracted[column] = parsed;
    }
    if (name === "05_students_leads") {
      await writeFile(join(stage, "data", "_raw_students_leads.json"), JSON.stringify(extracted), { mode: 0o600 });
    } else {
      for (const [column, parsed] of Object.entries(extracted)) {
        await writeFile(join(stage, "data", "_raw_" + column + ".json"), JSON.stringify(parsed), { mode: 0o600 });
      }
    }
    console.log(`[report-sync] ${name} received and parsed.`);
  }
  currentJob = "validation";
  phase = "assemble";
  // Use the original assembler and its safety checks, without changing upstream source.
  execFileSync("python3", ["refresh.py", "--term", term, "--window", term, today,
    "--rules", "rules-29acaca6df81"], { cwd: stage, stdio: "pipe", maxBuffer: 2_000_000 });
  const document = JSON.parse(await readFile(join(stage, "data/real.json"), "utf8"));
  currentJob = "database";
  phase = "insert";
  await pool.query(
    "INSERT INTO school_report_snapshots (window_start, window_end, document) VALUES ($1, $2, $3::jsonb)",
    [term, today, JSON.stringify(document)],
  );
  console.log(`[report-sync] Snapshot saved in PostgreSQL: ${document.campuses.length} schools, ` +
    `${document.campuses.reduce((sum: number, row: { enr: number }) => sum + row.enr, 0)} enrolled students. ` +
    "No private rows have been written into public files.");
} catch (error) {
  // Upstream errors can contain signed configuration, SQL, or personal data: never print them verbatim.
  const status = typeof error === "object" && error !== null && "status" in error ? error.status : undefined;
  const kind = error instanceof Error && /^[A-Za-z][A-Za-z0-9_-]{0,60}$/.test(error.name) ? error.name : "unknown";
  console.error(`[report-sync] Failed at ${currentJob} (${phase}, ${kind})` +
    `${typeof status === "number" ? ` (upstream HTTP ${status})` : ""}. ` +
    "No new snapshot was published.");
  if (error instanceof Error && currentJob === "validation") {
    const stderr = "stderr" in error && Buffer.isBuffer(error.stderr) ? error.stderr.toString() : "";
    console.error(`[report-sync] Assembler exit: ${stderr.split("\n")[0].slice(0, 180) || "sanity checks failed"}.`);
  }
  process.exitCode = 1;
} finally {
  client?.close();
  if (stage) await rm(stage, { recursive: true, force: true });
  await pool.end();
}
