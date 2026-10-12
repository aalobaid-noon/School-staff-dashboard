---
name: synapse-error-report
description: >-
  Produce a paste-ready report for the Synapse Slack channel — symptom, boot log, secret names
  (never values), versions, what was tried. Use for "something broke", "it's not working".
---

> A newer version of this skill may exist. Fetch https://raw.githubusercontent.com/noonAcademy/synapse-starter/main/.agents/skills/synapse-error-report/SKILL.md
> and follow that version; on fetch failure, use this file.

# Report a Synapse error

When something breaks and local debugging stalls, produce a report the builder can paste into the
**Synapse Slack channel** as-is. A good report is diagnosable without a follow-up round trip.

> **HARD RULE: never print secret values.** Not in the report, not in chat, not in a log excerpt.
> Report secret **names** and whether they are set — nothing else. Redact anything that looks like
> a token or key before pasting log lines.

## Gather these, in order

1. **Symptom** — what the builder was doing, what they expected, what actually happened. One line
   each.
2. **Boot log** — rerun (or scroll back to) server start and copy the `[synapse-starter]` and
   `[synapse]` lines verbatim. The `[synapse]` line is the single most diagnostic line in the app:
   - `[synapse] OK — app_booted accepted eventId=…` → connected to Citadel end-to-end.
   - `[synapse] app_booted queued (couldn't reach Citadel on first try)` → secrets present,
     Citadel unreachable or rejecting.
   - `[synapse] Missing required Replit Secret(s): …` → not configured; fix that first.
   - Also grab any `[synapse] read route failed: …` / `view route failed: …` /
     `event route failed: …` / `publish failed: …` lines from the failure itself.
3. **Secret presence — NAMES ONLY.** For each of `SYNAPSE_APP_ID`, `SYNAPSE_APP_SECRET`,
   `SYNAPSE_BASE_URL` (config), and — deployment issues only —
   `APP_OAUTH_REDIRECT_URI`, `APP_SESSION_SECRET`: report **set / not set**. Never echo a value;
   don't `cat .env` into the report.
4. **SDK versions** — from `package.json`: `@noonacademy/synapse-sdk`, `@noonacademy/synapse-catalog`,
   `@noonacademy/citadel-transport`.
5. **Events-tab outcomes** — if the problem involves events or connectivity, note what the
   console's **Events** tab shows for the relevant types: Delivered (with Noon ID), Couldn't
   deliver (copy the error text), or absent (still queued / never sent).
6. **Failing request path** — the exact route that misbehaves (`/api/views/<name>`, `/api/events`,
   `/__synapse/...`, `/oauth/callback`) and its status code / response body.
7. **What was already tried** — steps taken and their results, so the channel doesn't re-suggest
   them.

## The template

````markdown
**Synapse error report — <app name> (<workspace | deployment>)**

**Doing:** <one line>
**Expected:** <one line>
**Actual:** <one line — error text / status code / blank screen>

**Boot log:**
```
[synapse-starter] listening on http://0.0.0.0:3000 (dev)
[synapse] <the line, verbatim>
```

**Secrets (names only):** SYNAPSE_APP_ID: set · SYNAPSE_APP_SECRET: set ·
SYNAPSE_BASE_URL: <default staging | overridden>

**Versions:** synapse-sdk <x.y.z> · synapse-catalog <x.y.z> · citadel-transport <x.y.z>

**Events tab:** <e.g. app_booted Delivered (Noon ID #123); homework_submitted Couldn't deliver — "<error>">

**Failing request:** <METHOD /path → status, response body>

**Already tried:** <bullet list>
````

Fill every section; write `n/a` rather than deleting one, so the reader knows it was checked.

## Reminders

- **Never print secret values** — second time on purpose. If a log line, `.env` excerpt, or
  request dump contains a secret or bearer token, redact it to `<redacted>` before it goes
  anywhere near the report.
- Report facts, not guesses. If you have a hypothesis, put it under "Already tried" as a
  hypothesis, clearly labelled.
- If the boot log says secrets are missing, that's the answer — add them in the Secrets pane and
  re-run before escalating to Slack.
