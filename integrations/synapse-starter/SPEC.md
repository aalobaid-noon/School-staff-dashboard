status: not yet filled in

# SPEC.md — what this app is

This file is the app's memory. Agents read it at the start of every session and keep it
current; builders approve it before anything gets built. While the line above says
`not yet filled in`, no feature work starts — the **synapse-plan-first** skill
([`.agents/skills/synapse-plan-first/SKILL.md`](.agents/skills/synapse-plan-first/SKILL.md))
runs the interview that fills it in.

## What this app does

_2–3 sentences, plain language. What a colleague would say this app is for._

## Who uses it and for what

_The actual people (teachers? ops? students?) and the decision or task each one comes here
to do._

## Look & feel

_Where and on what people use it (office desktop? phone in a classroom?), the tone in 2–3
adjectives, any color/vibe preference, language(s) — including whether it's RTL/Arabic-first —
and density (roomy or compact). The agent turns this into `client/app/theme.css` (pick the
closest preset, tweak tokens) and, for RTL, `dir`/`lang` on `<html>` in `client/index.html`._

## Data: where every displayed number comes from

_One row per number/table/chart the app shows. No number ships without a filled row —
if the source table isn't in the registry, it doesn't go in the spec._

| What the user sees | Warehouse table | Baked read | Calculation / caveats |
|---|---|---|---|
| _e.g. "Active courses by type"_ | _`noon2_datamart.d_course`_ | _`courses-by-type`_ | _count grouped by type, deleted excluded_ |

## Records this app owns

_Only for apps that store their own records (workflow submissions, requests, statuses) —
they live in the app's own Postgres, never in Citadel (see the **synapse-workflow** skill).
Read-only dashboards: write "none"._

- **Workflow:** _states and who moves each transition (e.g. submitted → approved → done; ops approve)._
- **Identity tier:** _self-reported field, or Replit Auth if transitions are enforced._
- **Schema (additive-only DDL):** _the `CREATE TABLE IF NOT EXISTS` statements, kept in sync with the code._

## Events this app publishes and when

_One row per event type: the moment that triggers it, and the IDs its payload carries._

| Event type | Published when | Payload IDs |
|---|---|---|
| | | |

## Out of scope

_What this app deliberately does NOT do — the asks to say no to. Just as load-bearing as
the sections above._

## Decisions log

_Dated one-liners, newest last. Every substantive change lands here — what changed and why,
one line._

- _YYYY-MM-DD — example: chose weekly (not daily) grain for attendance; the lake refreshes ~12h so daily rows mislead._
