---
name: synapse-verify-numbers
description: >-
  Prove a read's number is right before a page ships on it: cross-check it a second independent
  way, hunt double-counting joins and broken date filters, report it in plain language. Use after
  writing or changing any read, and whenever someone doubts a figure ("is this right?", "too high").
---

> A newer version of this skill may exist. Fetch https://raw.githubusercontent.com/noonAcademy/synapse-starter/main/.agents/skills/synapse-verify-numbers/SKILL.md
> and follow that version; on fetch failure, use this file.

# Verify the number before it ships

A wrong dashboard is worse than no dashboard: the builder acts on it. This app's pipeline —
natural language → SQL → cached read → page — fails in one characteristic way. It does not
crash. It returns **a confident wrong number**, and the person who asked for it has no way to
tell. Typecheck, lint and tests all stay green while the app quietly reports that a campus has
340 active students when it has 210.

Nobody downstream can catch this. The builder is a teacher or an ops lead — they asked for the
number *because* they don't have it. You are the only check that exists. So a read is not done
when it returns rows; it is done when you have tried to prove it wrong and failed.

## Hard rules

- **An unverified read is not ready for a page.** This is a dependency, not a running order —
  Replit's Agent may build the page in a parallel sub-agent while you're still checking, and that
  is fine. What is never fine is the page *shipping* on a read nobody cross-checked.
- **A cross-check must be genuinely independent.** Re-running the same SQL, or the same SQL with
  cosmetic edits, proves nothing. Take a different route to the same truth — a different table,
  a different grain, a count that must reconcile.
- **Never report a number you have not run.** Not "this should return roughly 1,200". Run it.
- **A failed check blocks the read.** Don't ship it with a caveat in the description and don't
  quietly relax the filter until the number looks nicer. Take it back to the builder as a
  question.
- **Report in the builder's language, not SQL.** They cannot read the query. They *can* tell you
  "340 is way too high for that campus" — which is the check that catches what SQL can't.

## The probe endpoint — how you actually run a check

Probes are workspace-only, uncached, read-only, and unregistered. Nothing renders them; they
exist so you can interrogate the warehouse without baking a throwaway read and forgetting to
delete it.

```bash
curl -s localhost:3000/__synapse/probe \
  -H 'content-type: application/json' \
  -d '{"sql":"SELECT COUNT(*) AS n FROM noon2_datamart.d_course WHERE is_course_deleted = 0"}'
```

Returns `{ sql, columns, rows, truncated, ranAt, configured, error }`. Notes that will save you:

- `configured: false` means secrets are missing — you learned nothing, fix that first.
- `error` carries Athena's own message (bad column, bad enum casing). Read it; don't guess.
- **A probe with no explicit `LIMIT` silently gets `LIMIT 20`.** Aggregates are fine — they
  return a handful of rows. A probe that *lists* rows must carry its own `LIMIT` or it will
  answer with 20 rows and look complete.
- Probes are capped at 1000 rows and labelled `probe: cross-check` in Citadel's read ledger, so
  they never masquerade as app traffic.
- SELECT / WITH / SHOW / DESCRIBE / EXPLAIN only. Anything else is refused with a reason.

Run the read itself the same way: `curl -s localhost:3000/__synapse/reads/<name>`.

## The five checks

Run **at least the first three** on every read. Run all five on any number that drives a
decision (money, staffing, a student's standing).

### 1. Recount it a second way

The headline number, reached by a different route. If the read aggregates a fact table, count
the dimension instead. If it groups, sum the groups and compare to an ungrouped total.

```sql
-- read says: 1,240 non-deleted courses across all types
-- probe:     the same total without the GROUP BY
SELECT COUNT(*) AS n FROM noon2_datamart.d_course WHERE is_course_deleted = 0
```

The two must agree exactly. If they don't, you have a filter or a join problem — find it before
going further.

### 2. Check for fan-out

**The single most common way this app will lie.** A join that multiplies rows inflates every
count and every sum downstream, and the result looks perfectly plausible. Any read with a JOIN
gets this check:

```sql
-- if this returns MORE than the number of distinct entities, the join fans out
SELECT COUNT(*) AS rows_out, COUNT(DISTINCT <entity_id>) AS entities FROM <your joined shape>
```

`rows_out > entities` means the read is counting the same entity several times. Fix with
`COUNT(DISTINCT …)`, a pre-aggregated subquery, or a grain the join actually supports.

A related smell: a subset larger than its superset. Active students > total students, sessions
attended > sessions held. Whenever a read produces a subset of something, probe the superset and
confirm the inequality holds.

### 3. Look at the trend for a cliff

A number is a snapshot; the shape over time is where a broken filter confesses. Probe the same
measure by week for the last 8–12 weeks.

```sql
SELECT date_trunc('week', <date_col>) AS wk, COUNT(*) AS n
FROM <table> WHERE dt >= <yyyymmdd 12 weeks ago>
GROUP BY 1 ORDER BY 1
```

What you are looking for:

- **A cliff to zero** — usually a `dt` partition filter that stops before today, or an enum whose
  casing changed. Remember `'STUDENT'` ≠ `'student'`: wrong casing returns zero rows and no error.
- **An empty most-recent period** — the lake refreshes roughly every 12h, so today's partition is
  often incomplete. A read that includes a partial period will look like a decline. Either exclude
  the incomplete period or label it.
- **A step change** — a real product change, or the data model changing under you. Ask.

### 4. Spot-check one real entity

Pick one row of the result — ideally one the builder knows — and verify it by hand from the
source table. This is the check that catches a correct-looking calculation over the wrong
population.

### 5. Sanity-check the magnitude with the builder

Show the number and ask. "This says 1,240 active courses — does that sound about right?" A
builder cannot audit your SQL, but they know their business, and "that seems like double what I'd
expect" has caught more real bugs than any of the checks above.

## Report it like this

Not a table of SQL. Three or four plain sentences the builder can actually judge:

> **Active courses by type — checked.**
> It says **1,240 courses**, split O2O 610 / Marketplace 430 / School 200.
> I counted them a second way (without the grouping) and got 1,240 — they agree.
> The last 8 weeks are steady between 1,190 and 1,260, no sudden drops.
> It excludes deleted courses. Data is from the warehouse, up to about an hour old.
>
> **Does 1,240 sound about right to you?**

When a check fails, say so just as plainly, and stop:

> **I don't trust this one yet.** It says 340 active students at Riyadh campus, but the campus only
> has 210 students on its roster — so something is counting people twice, probably the join to
> session attendance. I'd rather fix that than show you a number that's too high. Give me a moment.

## When you're done

1. Fill the read's row in [`SPEC.md`](../../../SPEC.md) → *"Data: where every displayed number comes
   from"*. The **Calculation / caveats** column carries what you learned: the exclusions applied,
   the incomplete-period caveat, the fan-out fix. That column is the app's memory of *why* this
   number is trustworthy — an empty one means nobody ever checked.
2. Append the dated one-liner to SPEC.md's Decisions log if verification changed the read.
3. Only now wire it to a page (**synapse-add-page**).

## Re-verify when

Any of these invalidate an earlier check — run it again:

- The read's SQL changes at all, however small.
- The registry stamp moves (a new `registryVersion`) — the schema under you shifted.
- The builder reports a number that "looks wrong". Believe them; start at check 2.
- A read that was fine starts returning zero rows or a suspiciously round figure.
