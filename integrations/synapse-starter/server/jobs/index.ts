// Registry of scheduled jobs, keyed by job name. Adding a job = adding a server/jobs/<name>.job.ts
// file and registering it here — the same file-plus-registry convention as baked reads
// (server/queries/index.ts) and app pages (client/app/pages/index.ts), so the third kind of thing
// this app can contain is extended the same disciplined way as the first two.
//
// A job runs in a SEPARATE process from the web server (Replit Scheduled Deployments run a
// command, not a request). Nothing is shared with the running app: not the in-memory read cache,
// not the events list on the console, not module state. Everything a job needs arrives through
// its JobContext. See the synapse-scheduled-job skill.
//
// The template ships no example job on purpose — jobs are inherently app-specific, and a shipped
// one would be a file every clone has to remember to delete.

import type { AthenaRows } from '../athena.js';

export interface JobContext {
  // Run a SELECT against Noon's warehouse. Fresh every time — a job does not see the web app's
  // ~1h read cache, and shouldn't: a digest that reports hour-old numbers as today's is a bug.
  athena(sql: string): Promise<AthenaRows>;
  // Announce something to Noon. Best-effort, exactly like the request path: if losing it would
  // matter, write it to the app's own database FIRST (see the synapse-workflow skill).
  publishEvent(type: string, payload: Record<string, unknown>): Promise<void>;
  // Goes to the scheduled deployment's log, which is where a builder debugging a job will look.
  log(message: string): void;
}

export interface JobResult {
  // One line a human can read in the deployment log to know what happened. Required — a job that
  // reports nothing is indistinguishable from a job that didn't run.
  summary: string;
}

export interface Job {
  name: string;
  title: string;
  description: string;
  run(ctx: JobContext): Promise<JobResult>;
}

interface JobModule extends Job {}

function toJob(m: JobModule): Job {
  return { name: m.name, title: m.title, description: m.description, run: m.run };
}

// Null-prototype map for the same reason the reads and pages registries use one: a request for an
// inherited key (e.g. `__proto__`) must resolve to undefined, not Object.prototype.
export const JOBS: Record<string, Job> = Object.assign(Object.create(null), {
  // Register jobs here, e.g.:
  //   [weeklyDigest.name]: toJob(weeklyDigest),
});

// Exported so a registered job module type-checks against the shape above even while JOBS is
// empty in a fresh clone (otherwise `toJob` reads as unused and lint removes the convention).
export { toJob };

export function getJob(name: string): Job | null {
  return JOBS[name] ?? null;
}

export function listJobs(): Job[] {
  return Object.values(JOBS);
}
