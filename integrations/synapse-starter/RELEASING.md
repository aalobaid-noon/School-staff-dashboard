# RELEASING.md — shipping template changes to the fleet (maintainers only)

Every clone of this repo is someone's app, frozen at whatever the template looked like on
clone day. The upgrade path ([`UPGRADE.md`](UPGRADE.md) + [`UPGRADES.md`](UPGRADES.md)) is
how they catch up — and it only works if every change to the template's own surface ships
with a version bump and a recipe. That's this file's one rule:

> **Any PR that changes a synapse-owned path** (per
> [`.synapse/ownership.json`](.synapse/ownership.json)) **must bump `TEMPLATE_VERSION` and
> append an `UPGRADES.md` entry — written by whoever ships the change, in the same PR,
> while the context is fresh.** Nobody writes a recipe for someone else's change three
> weeks later.

## Enforced, not remembered

Three layers run the **same** [`scripts/check-template-version.ts`](scripts/check-template-version.ts),
earliest first, so the miss is caught before it costs a round-trip:

1. **At authoring time** — the "Definition of done" callout in
   [`AGENTS.md`](AGENTS.md) ("Who owns what") tells the author/agent to bump + write the entry,
   and to run `npm run check:release` (a thin wrapper over the check).
2. **Before push** — [`.githooks/pre-push`](.githooks/pre-push) blocks a push that fails the
   check. It's activated by the `prepare` npm script ([`scripts/setup-hooks.mjs`](scripts/setup-hooks.mjs))
   on `npm install`, which points `core.hooksPath` at `.githooks` **only when origin is this
   template repo** — so a clone's git config is never touched. Bypass with `git push --no-verify`.
3. **In CI** — [`.github/workflows/template-version.yml`](.github/workflows/template-version.yml)
   runs it on every PR to `main`; a violating PR fails.

All three are guarded to this repo only (origin/`github.repository` check) and are **not** part of
`npm run verify` (clones run verify before every deploy; release discipline is not their problem).

## How to bump

1. `TEMPLATE_VERSION` is `YYYY.MM.DD` (today's date). If today already shipped, suffix it:
   `2026.07.16` → `2026.07.16.2` (→ `.3`, …). Comparisons everywhere are numeric,
   part-by-part.
2. Append the entry at the **top** of `UPGRADES.md`, following its laws (append-only;
   every recipe step an idempotent "ensure"; copy steps list synapse-owned paths only;
   shared paths via guided edits; builder-owned paths at most "create if missing").
   Include: **what changed**, **why a clone should care**, the **recipe**, and **how to
   verify**.
3. If you changed the ownership contract itself, update `.synapse/ownership.json` **and**
   the "Who owns what" section of `AGENTS.md` together — they must never disagree.
4. If the PR changes the **rules** so they start assuming code or files an older clone lacks
   (AGENTS.md or a skill now references a file, script, or endpoint the previous kit didn't
   ship), update the **kit-compatibility header** at the top of `AGENTS.md` to the version
   you just bumped to, in the same PR. Agents fetch these rules live, so a stale clone will
   read them: the header is what tells that clone's agent to offer an upgrade instead of
   following rules its kit can't satisfy. The pre-push gate's bump is the natural moment to
   check this. (Purely additive rule changes that any older kit can follow don't need a
   header move.)

Special case: refreshing the vendored SDK tarballs
([`scripts/sync-sdk.md`](scripts/sync-sdk.md)) changes `vendor/` — synapse-owned — so it
follows this rule like any other change: bump + entry (the entry's recipe is essentially
"copy `vendor/`, redo the `package.json` guided edit, reinstall").
