# Scheduled report sync (20 minutes after each data-lake refresh)

The report sync is a long import (one Athena read per step, 17 steps) that ends in an all-or-nothing
snapshot. `pnpm --filter @workspace/api-server run sync:dashboard` runs the same import without a
browser, so a Replit **Scheduled Deployment** can run it on a timer. A failed run publishes nothing and
the previous snapshot stays live. Every run (scheduled or manual) appears under "Recent sync runs" in
the admin console; a scheduled failure shows as `Scheduled import failed at step N`.

## Set up (Replit)

1. Deploy → **Scheduled** → New scheduled deployment from this workspace.
2. Build command: `pnpm install --frozen-lockfile`
3. Run command: `pnpm --filter @workspace/api-server run sync:dashboard`
4. Schedule, three runs a day, 20 minutes after each data-lake refresh. Cron `50 0,7,12 * * *` (UTC) =
   03:50, 10:50 and 15:50 in Riyadh. Check in the Replit schedule screen which timezone it interprets
   the cron in.
5. Give it the same secrets as the app: `DATABASE_URL`, `SYNAPSE_APP_ID`, `SYNAPSE_APP_SECRET`,
   `SYNAPSE_BASE_URL`. It uses the app's server-to-server credentials, not a user session, and does not
   need `SESSION_SECRET` or the OAuth redirect URL.
6. Run it once by hand from the Scheduled deployment page and confirm in `/admin` that "Last successful
   sync" moves and the run shows as Succeeded before relying on the schedule.

## Why these hours

The data lake refreshes three times a day (about 00:30, 07:30 and 12:30 UTC), so a sync can only see
new data after those. Running 20 minutes later gives every distinct data state exactly one sync, with
about 17 Athena reads each, and no run that would just re-read the same tables. The refresh time is
approximate: if a run ever lands before its refresh has finished, the report is simply one refresh
behind until the next slot. Move the slots later (for example `:10`) if the admin console shows the
data window not advancing.

## Behaviour to know

- Only one import runs at a time. If a manual sync from the dashboard is in progress when the schedule
  fires, the scheduled run exits with an error and tries again at the next slot.
- A run that fails part-way is not resumed; the next slot starts from step 1.
- Run time is the sum of 17 Athena queries (each capped at 180 s), typically several minutes.
