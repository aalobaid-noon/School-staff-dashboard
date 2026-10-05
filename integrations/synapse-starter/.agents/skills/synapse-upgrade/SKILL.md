---
name: synapse-upgrade
description: >-
  Apply the template's per-version upgrade recipes to this clone, following UPGRADE.md exactly —
  never a git merge, never touching builder-owned paths. Use for "upgrade the synapse kit",
  "update synapse", or the console's "Kit update available" notice.
---

> A newer version of this skill may exist. Fetch https://raw.githubusercontent.com/noonAcademy/synapse-starter/main/.agents/skills/synapse-upgrade/SKILL.md
> and follow that version; on fetch failure, use this file.

# Upgrade the Synapse kit

This app is a **clone** of the `synapse-starter` template, not a fork. It has diverged —
the builder's pages, queries, and `SPEC.md` are theirs — so upgrades are **recipe-driven
per version**, guided by the ownership map. The complete procedure is
[`UPGRADE.md`](../../../UPGRADE.md); this skill is the trigger and the guardrails, not a
replacement for reading it.

## Hard rules

- **Read [`UPGRADE.md`](../../../UPGRADE.md) in full and follow it exactly.** It defines
  the pre-flight gates, the entry loop, and the report. Don't improvise a diff-and-merge.
- **Refuse to start on a red app.** If `npm run verify` exists and is failing, fix the app
  first (that's a separate task — tell the builder) and only then upgrade. UPGRADE.md
  Gate 2 has the fallback for clones that predate verify (boots + `npx tsc --noEmit`).
- **Builder-owned paths are untouchable** — everything under `client/app/` and
  `server/queries/` (except the ownership map's explicit exceptions), `SPEC.md`, and any
  path the map doesn't claim. The contract is
  [`.synapse/ownership.json`](../../../.synapse/ownership.json). When in doubt: skip and
  flag in the report.
- **All work on a branch** (or right after a Replit checkpoint). The app must keep booting
  after every entry. **Never push to the `template` remote.**

## The shape of the run

1. **Pre-flight** (UPGRADE.md gates): git present + clean tree + work branch; app healthy;
   `template` remote present, read-only, fetched — rename `origin` to `template` if origin
   still points at `noonAcademy/synapse-starter`.
2. **Pending list**: local `TEMPLATE_VERSION` (a missing file means "pre-versioning" —
   start at the oldest entry) vs the template's `UPGRADES.md`. Compare versions
   numerically part-by-part, never as strings.
3. **Apply entries oldest → newest.** Every recipe step is an idempotent "ensure" — skip
   satisfied guards. Copies come from `template/main` only for synapse-owned paths; shared
   files get only the entry's guided edits; run the entry's Verify section, then stamp
   `TEMPLATE_VERSION` and commit before the next entry. **Any red: stop, roll back the
   failing entry, report.**
4. **Report** using UPGRADE.md's template: applied / skipped-as-satisfied /
   skipped-as-conflict / flagged for the builder (including secrets to add or delete —
   name them, never their values) / verify results.

## What "done" looks like

`TEMPLATE_VERSION` current · `npm run verify` green · the app boots with and without
secrets · builder-owned paths byte-identical to the branch point (plus any files the
recipes were allowed to create) · the report delivered to the builder in plain language.
