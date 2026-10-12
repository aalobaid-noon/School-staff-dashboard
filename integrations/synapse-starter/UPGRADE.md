# UPGRADE.md — Upgrade a clone of this template to the current kit

This guide is for an **AI coding agent** upgrading an app that was **cloned from
`synapse-starter`** and has since diverged: the builder — almost always non-technical — has
built their own pages, queries, and spec on top of the scaffolding. The greenfield path
(fresh clone) and the existing-app path ([`INTEGRATE.md`](INTEGRATE.md)) are not this. Here
you are a **mechanic servicing someone's car, not redesigning it**.

**A clone is NOT a fork.** You never `git merge` from the template, never rebase onto it,
never diff-and-apply wholesale. Upgrades are **recipe-driven per version**: each
[`UPGRADES.md`](UPGRADES.md) entry says exactly what to copy, run, and edit, and the
ownership map ([`.synapse/ownership.json`](.synapse/ownership.json), prose in AGENTS.md
"Who owns what") says what you may touch at all.

## The prime directive

**Every change is additive and reversible, and the builder's app is sacred.** All work
happens on a branch (or, on Replit without git, immediately after a checkpoint you can roll
back to). The app must keep booting at every step. **Builder-owned paths are untouchable** —
their pages, their `SPEC.md`, their queries, anything the template doesn't ship. And you
**NEVER push to the template repo** — the `template` remote is read-only, forever.

## Ownership in one breath

- **Synapse-owned** → copy freely from the template (overwrites, additions, deletions).
  But a pattern like `server/**` claims only files the template actually ships — a file the
  builder created under it is builder-owned, full stop.
- **Shared** (`package.json`, `server/index.ts`, the two registries, `theme.css`,
  `client/index.html`, `.replit`, the lockfile) → only the guided edits an entry spells
  out, always preserving the builder's additions. The lockfile is regenerated, never copied.
- **Builder-owned** (everything under `client/app/` and `server/queries/` except the map's
  explicit exceptions, `SPEC.md`, anything unclaimed) → never edit, never delete. Creating
  a file at a path the clone doesn't have is the one permitted write.

When in doubt about a path: it's builder-owned. Skip it and flag it in the report.

## Pre-flight gates — check in order, STOP if one fails

- [ ] **Gate 1 — Version control.** `git` is available and the working tree is **clean**
  (commit or stash first — the rollback story depends on it). No git at all? `git init` +
  commit everything as `pre-upgrade snapshot` before anything else. Then create the work
  branch: `git checkout -b kit-upgrade/<today>`.

- [ ] **Gate 2 — The app is healthy BEFORE you start.** A broken app gets **fixed first,
  not upgraded** — otherwise you can't tell your breakage from theirs.
  - If `npm run verify` exists: it must be green.
  - If it doesn't exist yet (clones that predate the verify tooling): the gate is
    **the app boots** (`npm run start` logs `[synapse-starter] listening`, secrets or not)
    **and `npx tsc --noEmit` passes**.
  - Known exception: a pre-vendoring clone with no `node_modules` can't even
    `npm install` without a `GITHUB_TOKEN`. If install is the only thing failing, and it's
    failing on GitHub Packages auth, proceed — the vendoring step of the catch-up entry is
    the cure — and run this gate's boot check immediately after that entry's install step.

- [ ] **Gate 3 — The template remote, read-only.**
  - A clone's `origin` sometimes still points at the template
    (`noonAcademy/synapse-starter`). If so: `git remote rename origin template` — rename,
    don't delete, and don't leave it as `origin` (an accidental `git push origin` must have
    nowhere to land).
  - Otherwise, if no `template` remote exists:
    `git remote add template https://github.com/noonAcademy/synapse-starter.git`
  - Then `git fetch template main`.

## The loop

1. **Read the local version.** `TEMPLATE_VERSION` at the repo root. **Missing file =
   pre-versioning clone** — your pending list starts at the oldest entry in `UPGRADES.md`
   (the catch-up entry is written for exactly this).
2. **Read the template's `UPGRADES.md`** (from `template/main` — it lists every version).
   Pending = entries **newer than local**. Compare versions numerically, part by part
   (`2026.07.16` → `[2026, 7, 16]`; a `.N` suffix is a fourth part; missing parts are 0).
   Never compare as strings.
3. **Apply pending entries oldest → newest.** For each entry:
   - Follow its recipe steps **in order**. Every step is an "ensure" — if its guard says
     the clone already has it, skip it. Copies come from `template/main`
     (`git checkout template/main -- <path>`); that's the single-hop rule, so a copy step
     repeated by a later entry is a harmless no-op.
   - Run the entry's **Verify** section (or `npm run verify` once it exists). **Any red:
     STOP.** Fix only what the upgrade itself broke; if the failure is pre-existing or
     unclear, roll back to the branch point and report instead.
   - On green: set `TEMPLATE_VERSION` to that entry's version and commit the entry as one
     commit (`kit upgrade: <version>`). A later failure then resumes from here, not from
     scratch.
4. **Never widen the blast radius.** If a recipe step conflicts with something the builder
   built (a copy target they modified, a guided edit that won't reconcile), do **not**
   force it: skip the step, keep their version, note it in the report. An imperfect upgrade
   that respects the app beats a perfect one that breaks it.

## End state — all of these, observed not assumed

- [ ] `TEMPLATE_VERSION` equals the newest applied entry.
- [ ] `npm run verify` green.
- [ ] The app boots — with and without secrets set.
- [ ] `git status` clean, work committed on the upgrade branch.
- [ ] Builder-owned paths byte-identical to the branch point
  (`git diff <branch-point> -- client/app server/queries SPEC.md` shows only files the
  recipes were allowed to create).

Then write the report:

```markdown
# Kit upgrade report — <app name>

- **From → to:** <old TEMPLATE_VERSION or "pre-versioning"> → <new>
- **Entries applied:** <versions, one line each: what it brought this app>
- **Steps skipped (already satisfied):** <ensure-guards that short-circuited>
- **Steps skipped (conflict — kept the builder's version):** <path: why — none is the goal>
- **Flagged for the builder:** <optional follow-ups, e.g. shell footer link; secrets to
  delete/add per the entries — GITHUB_TOKEN, GOOGLE_CLIENT_ID out; APP_* in for deploys>
- **Verify:** green (secret scan · typecheck · lint · tests) · boots with/without secrets
```

## Rollback

Trivial by construction: the branch (or Replit checkpoint) IS the rollback. Nothing outside
the working tree is modified — no secrets were changed, and the template repo was never
written to. Drop the branch, or restore the checkpoint, and the app is exactly what it was.
