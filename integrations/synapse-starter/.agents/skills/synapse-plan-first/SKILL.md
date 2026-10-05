---
name: synapse-plan-first
description: >-
  Interview the builder and fill SPEC.md before any code is written. Use at the start of any
  new build ("build me…", "I want an app that…") and whenever SPEC.md says "not yet filled in".
---

> A newer version of this skill may exist. Fetch https://raw.githubusercontent.com/noonAcademy/synapse-starter/main/.agents/skills/synapse-plan-first/SKILL.md
> and follow that version; on fetch failure, use this file.

# Plan first — fill SPEC.md before building

`SPEC.md` (repo root) is this app's memory: agents read it at the start of every session, and
it's the contract for what gets built. This skill fills it in by **interviewing the builder**,
then gets their approval, and only then hands off to building.

> **HARD RULE: never start coding while `SPEC.md` says `status: not yet filled in`.** No pages,
> no reads, no events, no "quick prototype first". The interview is the first deliverable.

## How to interview

- **One question at a time.** Ask, wait, then ask the next. Never a wall of questions.
- **Plain, non-technical language.** The builder is a teacher or an ops person, not an engineer.
  Ask "which numbers do you check every morning?", not "what dimensions do you want to slice by?".
- **Push back on UI-first asks.** "A dashboard" is not an answer — reply with: *which* numbers,
  from *where*, calculated *how*? A chart with no defined source number is not spec'd yet.
- **"Everything" is not scope.** When the answer is broad, ask what they'd keep if they could
  only have three numbers. Move the rest to Out of scope.

Work through the SPEC sections in order — each one is roughly one or two questions:

1. **What this app does** — "Describe the app in two sentences, like you're telling a colleague."
2. **Who uses it and for what** — "Who opens this, and what decision are they trying to make?"
3. **Look & feel** — at most TWO light questions; don't let this bloat the interview:
   - "Where will people use this — a desk, a phone in a classroom? And in which language(s)?"
     (covers context + language, including whether the app is Arabic-first/RTL)
   - "Should it feel calm, bold, or warm — and roomy or compact?" (covers tone/vibe + density;
     note any color preference they volunteer)
4. **Data** — for every number they want: what it is, and how it's calculated. This is where
   most of the interview happens.
5. **Records this app owns** — if their description involves people *submitting, requesting,
   approving, logging, or changing* anything, the app keeps its own records; ask the
   state-machine questions now, not as a retrofit when storage is first added. "What happens
   after someone submits — what states does it move through?" (e.g. submitted → approved →
   done), "Who moves it from one state to the next?", and does that need enforcing, or is a
   self-reported name field enough? (Identity tiers and storage: the **synapse-workflow**
   skill.) Fill the "Records this app owns" section; for a read-only dashboard, write "none".
6. **Events** — "What happenings in this app should Noon know about?" (Domain moments, not
   clicks — see the synapse-event-design skill.)
7. **Out of scope** — "What should this app deliberately NOT do?"

## Verify the data exists — before it goes in the spec

Never promise a number the warehouse can't produce. For each number from step 3, check the
data registry ([`server/citadel-schema.ts`](../../../server/citadel-schema.ts), browsable on
the **Get data** tab) — and let the **noon-sql-analyst** skill
([`skill/SKILL.md`](../../../skill/SKILL.md)) confirm the table, columns, and calculation.

- **Exists** → record the row in the Data table: what the user sees → warehouse table → baked
  read name → calculation and caveats.
- **Doesn't exist / can't be derived** → say so now, in the interview, and offer the nearest
  thing that does exist. A spec row is a promise; only make keepable ones.

Remember the app's read constraints while checking: reads are **app-wide** (no per-user
scoping), and rendered data can be up to ~1h behind a ~12h lake refresh. A spec that needs
per-student live data needs redesigning *in the interview*, not at build time.

## Write, approve, then build

1. **Write `SPEC.md`** — fill every section; keep the table shapes the template ships with.
   Add the first Decisions-log line: `YYYY-MM-DD — initial spec agreed`.
2. **Show it to the builder and ask for approval** in plain terms: "This is what I'll build —
   did I get it right?" Fold in corrections and ask again.
3. **On approval, flip the top line** to `status: approved YYYY-MM-DD`.
4. **Set the theme before building any page.** From the Look & feel answers, edit
   [`client/app/theme.css`](../../../client/app/theme.css): activate the closest preset
   ("calm" / "bold" / "warm") and tweak individual tokens (e.g. `--color-primary` for a stated
   brand color). If the app is Arabic-first/RTL, also set `dir="rtl" lang="ar"` on `<html>` in
   [`client/index.html`](../../../client/index.html) — direction is not a CSS token. Those two
   files are the whole restyle; never hardcode colors in components.
5. Only now does building start — usually via the **synapse-add-page** skill, one Data-table
   row at a time. The placeholder home page (`client/app/pages/home.tsx` rendering
   `<NotBuiltYet />`) gets replaced with the real product as part of this.

## Keeping SPEC.md alive

After any substantive change (new page, new read, new event, changed calculation, descoped
feature): append a dated one-liner to the Decisions log and update the affected sections.
A stale spec is worse than an empty one — the next session trusts what it reads here.
