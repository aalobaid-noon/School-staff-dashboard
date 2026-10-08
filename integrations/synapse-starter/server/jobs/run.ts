// The entry point a Replit Scheduled Deployment runs:  npm run job -- <name>
//
// Deliberately a CLI and not an HTTP route. A scheduled deployment runs a COMMAND in its own
// process, so a job must be startable without the web server — and an HTTP-triggered job would
// need a route that either sits unauthenticated (anyone can fire it) or needs a secret the
// scheduler must carry. A command has neither problem.
//
// Exit codes matter: Replit marks a scheduled run failed on a non-zero exit, which is how a
// builder finds out their Monday digest stopped working. Never swallow an error into exit 0.

import { asAthenaClient, runAthenaQuery } from '../athena.js';
import { synapse, synapseConfigError } from '../synapse.js';
import { getJob, type JobContext, listJobs } from './index.js';

function fail(message: string): never {
  console.error(`[job] ${message}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const name = process.argv[2];
  const known = listJobs()
    .map((j) => j.name)
    .join(', ');

  if (!name) {
    fail(
      `no job named. Usage: npm run job -- <name>${known ? `\n[job] known jobs: ${known}` : ''}`,
    );
  }

  const job = getJob(name);
  if (!job) {
    fail(`unknown job "${name}".${known ? ` Known jobs: ${known}` : ' No jobs are registered.'}`);
  }

  // A job with no credentials would otherwise "succeed" having read nothing and published
  // nothing — the worst outcome, because the schedule keeps reporting green. Fail loudly instead.
  if (synapseConfigError !== null || synapse === null) {
    fail(
      `${synapseConfigError ?? 'Synapse client unavailable'}\n` +
        '[job] a scheduled deployment has its OWN secrets — setting them in the workspace is not enough.',
    );
  }

  // Bound to a local so the null check above narrows inside the closures below — `synapse` is a
  // module-level binding and TypeScript won't carry a narrowing across one.
  const sdk = synapse;
  const client = asAthenaClient(sdk);
  if (!client) fail('Synapse client unavailable');

  const started = Date.now();
  const ctx: JobContext = {
    athena: (sql) => runAthenaQuery(client, sql, undefined, `job: ${job.name}`),
    publishEvent: async (type, payload) => {
      await sdk.publishEvent(type, payload);
    },
    log: (message) => console.log(`[job:${job.name}] ${message}`),
  };

  try {
    const result = await job.run(ctx);
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`[job:${job.name}] done in ${secs}s — ${result.summary}`);
  } catch (err) {
    console.error(`[job:${job.name}] FAILED:`, err instanceof Error ? err.stack : err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[job] runner crashed:', err instanceof Error ? err.stack : err);
  process.exit(1);
});
