---
name: synapse-scheduled-job
description: >-
  Work that runs on a schedule instead of on a page load — digests, alerts, exports — as a job
  plus a Replit Scheduled Deployment. Use for "every Monday", "each morning", "alert me when",
  "send me a summary".
---

> A newer version of this skill may exist. Fetch https://raw.githubusercontent.com/noonAcademy/synapse-starter/main/.agents/skills/synapse-scheduled-job/SKILL.md
> and follow that version; on fetch failure, use this file.

# Work that runs on a schedule

Most of this app answers a question when someone opens a page. A **job** answers it when nobody
is looking: a Monday-morning digest, a nightly check that attendance hasn't collapsed, a weekly
export.

A job is a third registered thing, alongside reads and pages, and it follows the same
file-plus-registry convention: `server/jobs/<name>.job.ts`, registered in
[`server/jobs/index.ts`](../../../server/jobs/index.ts), run with `npm run job -- <name>`.

## The one thing that trips everyone up

**A scheduled deployment is a separate process.** It runs a command; it is not your web server
handling a request. Nothing is shared:

- **No read cache.** Every `ctx.athena()` hits the lake fresh. That's correct for a job — a
  digest reporting hour-old numbers as "this morning" is a bug — but it means jobs pay full
  query cost every run.
- **No console Events tab.** That list is the *web server's* in-memory log. A job's publishes
  are real and reach Citadel; they just won't appear there. Check the deployment's own log.
- **Its own secrets.** This is the number one cause of "my job silently does nothing". Setting
  `SYNAPSE_APP_ID` / `SYNAPSE_APP_SECRET` in the workspace does **not** set them for a scheduled
  deployment. Set them there too. The runner fails loudly on missing credentials rather than
  reporting a green run that read nothing.

## Hard rules

- **Never schedule faster than the data changes.** The lake refreshes roughly every 12h. A job
  running every 5 minutes over a 12h-refresh warehouse burns Athena spend to recompute an
  identical answer ~144 times. Daily is the sensible floor for most jobs; hourly needs a reason.
- **Jobs must be idempotent.** A schedule can fire twice (a retry, an overlapping run, a manual
  test). Running a job twice must not send two emails or double-count anything. Key the work to
  a period ("week of 2026-08-03") and make a repeat run a no-op.
- **A job that finds nothing should say so and stop** — not send an empty digest every Monday
  until the builder stops reading them.
- **Events are announcements, not storage.** If losing it would matter, write it to the app's own
  database first, then publish (**synapse-workflow**).
- **Reuse a baked read's SQL when the job answers the same question as a page.** Import the
  module and pass `sql` to `ctx.athena` — two copies of the same query drift, and then the page
  and the digest disagree in front of the builder.

## Write the job

```ts
// server/jobs/weekly-digest.job.ts
import type { JobContext, JobResult } from './index.js';

export const name = 'weekly-digest';
export const title = 'Weekly attendance digest';
export const description = 'Every Monday: last week attendance per campus, published to Noon.';

export async function run(ctx: JobContext): Promise<JobResult> {
  const { rows } = await ctx.athena(`
    SELECT campus_name, COUNT(*) AS sessions
    FROM noon2_datamart.f_user_session
    WHERE dt >= 20260727 AND dt < 20260803
    GROUP BY campus_name
    ORDER BY sessions DESC
  `);

  if (rows.length === 0) {
    ctx.log('no sessions last week — nothing to report');
    return { summary: 'no data for the period; nothing published' };
  }

  await ctx.publishEvent('digest.weekly_attendance_compiled', {
    weekStart: '2026-07-27',
    campusCount: rows.length,
  });

  return { summary: `${rows.length} campuses summarised` };
}
```

Register it:

```ts
// server/jobs/index.ts
import * as weeklyDigest from './weekly-digest.job.js';

export const JOBS: Record<string, Job> = Object.assign(Object.create(null), {
  [weeklyDigest.name]: toJob(weeklyDigest),
});
```

Note the date window is **computed for the run**, not hardcoded, in a real job — derive it from
the current date so the same job works every week. Hardcode it only while testing.

## Test it before you schedule it

```bash
npm run job -- weekly-digest
```

It runs immediately, in your terminal, against real data. Read the summary line. **Never schedule
a job you haven't run manually at least once** — a job that fails on the schedule fails at 6am
into a log nobody is watching.

## Schedule it on Replit

Jobs run as a **Scheduled Deployment** (separate from the app's web deployment, which keeps
serving pages):

1. Replit → **Deploy** → **Scheduled**.
2. Command: `npm run job -- weekly-digest`
3. Schedule: the builder's cadence (respect the ≥ daily rule above).
4. **Add the secrets again** in the scheduled deployment's own Secrets: `SYNAPSE_APP_ID`,
   `SYNAPSE_APP_SECRET`, `SYNAPSE_BASE_URL`. This is the step that gets missed.
5. Run it once from the UI and read the log.

Tell the builder these are two separate deployments — the app and the schedule — so they aren't
surprised when redeploying one doesn't update the other.

## Getting the result to a human

`ctx.publishEvent` tells *Noon* something happened. It does not tell the *builder*. If they want
to actually receive the digest, that needs a channel, and this template ships none. Ask which:

- **A page in the app** — usually the right answer, and it needs no new integration. The job
  writes its result to the app's own Postgres, and a page reads it back. Costs nothing extra and
  the history is browsable.
- **Slack** — a webhook URL in a secret, POSTed at the end of the job. Simple, but it's a new
  outbound integration; confirm with the builder before adding one.
- **Email** — needs a provider (Resend, SendGrid) and its own credentials. Heaviest option.

Don't invent a channel. Ask, then record the choice in [`SPEC.md`](../../../SPEC.md).

## Record it

A job is part of what the app *is*, so it belongs in the spec:

- What it does and when it runs → SPEC.md's scope sections.
- Any event it publishes → the events table.
- Any table it writes → "Records this app owns".
- A dated line in the Decisions log.

## When something breaks

`synapse-error-report`, plus these first, since jobs fail differently from pages:

1. Did it run at all? Check the scheduled deployment's run history, not the app log.
2. Does it have secrets? The runner says so explicitly if not.
3. Does it work by hand? `npm run job -- <name>` locally.
4. Did the window slide? A hardcoded date range silently returns nothing forever.
