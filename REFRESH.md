# Refresh runbook

The data-lake queries run through the agent's MCP connector, not from a shell — so a
refresh needs a session (scheduled or interactive), not a plain cron job. Everything
after the queries is scripted.

## The window

- **Term start** — `2026-08-23`. Week numbers count from here: week *n* covers
  `term_start + 7(n−1)` to `+6 days`.
- **Extract window** — term start → today (exclusive end = tomorrow).
- **Weekly series** — complete weeks only; today's partial week is excluded so a
  week-over-week delta never compares a full week against a half one.

## Steps

1. `get_business_rules` → keep `rules_version`. If it differs from the one in
   `data/real.json`, re-read the rules before trusting the SQL.
2. Run the six queries in `queries/` (each prepends `00_common.sql`), substituting
   `{{START}} {{END}} {{DT_FROM}} {{DT_TO}} {{TERM}}`. Each returns a single JSON row;
   large results are written to a file by the harness — parse that file, never retype.
3. Save each result as `data/_raw_<name>.json`.
4. `python3 refresh.py` — assembles `data/real.json`, runs `build.py` and
   `build_press.py`, and prints a checksum report.
5. Publish:
   - **Artifact** — republish `dist/artifact.html` (same URL).
   - **Press** — `begin_deploy` slug `school-manager-dashboard` with the 25-file
     manifest from `press/`. Every file is under 20 KB so it all rides inline; the
     unchanged app/CSS chunks dedup by sha256, so only the data chunks travel.

## Getting a large result out of the MCP without retyping it

`run_query` prints small results inline. Anything big enough (roughly >40 KB) is written to
a file by the harness instead, and that file can be parsed — which is the only safe way to
move hundreds of rows, since hand-copying a payload out of the transcript is exactly how a
number gets silently corrupted.

To force the spill deliberately, append a pad column:

```sql
, ARRAY_JOIN(REPEAT(ARRAY_JOIN(REPEAT('.', 10000), ''), 12), '') AS spill_pad
```

(`REPEAT(str, n)` returns an *array* in Trino, hence the double `ARRAY_JOIN`; the string
form caps at 10,000, so nest it to go higher.) Then parse the saved file — note it has a
trailing prose note after the JSON, so use `json.JSONDecoder().raw_decode()`, not
`json.loads()`:

```python
obj, _ = json.JSONDecoder().raw_decode(pathlib.Path(saved).read_text(encoding="utf-8"))
payload = json.loads(obj["rows"][0]["<column>"])
```

For a payload small enough to arrive inline, verify it instead of trusting it: run a
one-row control query of the grand totals and check the saved file sums to it. That is how
the 2026-09-17 campuses and exams extracts were confirmed (66 / 5,033 / 4,900 / 241 /
4,891 / 1,181 and the three exam opened/completed pairs, all exact).

## A cohort's facilitator is not always a person

`d_school_student_courses.facilitator_id` can point at a Noon-internal **utility account**
rather than a member of staff. Until 2026-09-21 the dashboard took the field at face value,
and produced the worst error this tool can make: profile **608478 "Mohamed Hatim"** was shown
as the facilitator of **9 schools**, with those schools' attendance, exit-ticket and trust
numbers presented as his performance. He does not work at any of them, and said so.

What it actually is: one cross-school Qudrat-quant cohort, **«اتفان كمي1»**, holding 127
students from **17 campuses**, whose facilitator field points at a shared internal account —
`account_id 53452`, which also owns the profiles «فريق نون», "Noon Facilitator" and four named
after classrooms («فصل ماجد», «فصل الاستاذ خالد», …). That account attended **zero** sessions
and taught **zero** sessions this term.

The discriminator is the one the business rules already name: **`d_user.country_name`**.
Facilitators *are* Noon employees, so `kyy_noon2_internal_employees` flags all 195 of them and
is useless here — but every real facilitator carries `'Saudi Arabia'` and only the placeholder
carries `'Noon internal'`. `00_common.sql` defines that set as `nooner`, `04_facilitators.sql`
excludes it, and `refresh.py` enforces it again from a list the extract carries, so a stale raw
file cannot put a real name back onto a school. `refresh.py` prints a `placeholder` line
whenever it fires — if it ever names a NEW account, say so when reporting.

The 127 students are **not** dropped: they are real students at real schools and still count in
every campus figure. Only the attribution changes — their facilitator reads «غير مُسند», and a
structural notice names the cohort, the 17 schools and the student count, because "this class
has no owner" is itself the thing to act on.

## Campus names are not reliably unique

On 2026-09-17 the source stopped carrying the `- متوسط - بنين` style suffixes on
`campus_name`, and **12 names ended up shared by 29 of the 66 campuses** — four different
schools all called «مدارس دار البراءة العالمية». Every ticket in this dashboard names its
school, so that alone would have made a third of them ambiguous.

`queries/01_campuses.sql` therefore also pulls `school_level` and `allowed_gender` from
`noon2_core.campus`, and `refresh.py` appends them (`متوسط`/`ثانوي` + `بنين`/`بنات`/`مشترك`)
**only to names that repeat** — unique names stay short. Level + gender separates all 66
today; if it ever stops being enough, `refresh.py` refuses to write rather than publish
ambiguous tickets.

## Sanity checks before publishing

`refresh.py` fails loudly if any of these break:

- student total moved more than 20% since the last extract
- two campuses still share a display name after level+gender were appended
- a facilitator is a Noon-internal account (dropped, and reported on the `placeholder` line)
- any campus lost its manager, or the campus count dropped
- a metric came back null network-wide (usually a renamed exam or survey)
- the exam titles in `00_common.sql` no longer match anything — **the most likely
  breakage**, since they are literal titles that change each intake

## Known fragilities

- **Exam titles are hardcoded.** `Qudrat Diagnostics 2026`, `ESL Diagnostic - August 2026`,
  `Tahsili Diagnostics 2026`. A new intake renames these and the exam panel silently
  empties. `refresh.py` treats zero matched assessments as a hard error.
- **The weekly series is manager-grain.** Filters below manager hide the deltas by design.
- **Press upload.** Files over 20 KB need a browser upload, which a scheduled run cannot
  do — hence the 25-file split.

## Regenerating `press4/` (the 4-file Press bundle)

```bash
python3 mkpress4.py      # prints the manifest: path, sha256, bytes
```

It stamps each asset URL with its content hash (`data.js?v=9535d5a0`). Press serves the
same filenames on every deploy, so without this a browser keeps yesterday's `data.js` and
the manager reads stale numbers — this actually happened during development. Changed files
bust the cache; unchanged ones stay cached.

Feed that manifest to `begin_deploy` with no inline content. Press dedups by sha256 and
asks only for what changed. Deliver them through the upload page from a signed-in Chrome.

## Daily schedule

Task `noon-manager-dashboard-refresh` runs at 06:00 local, every day. It only runs while
the desktop app is open; if it was closed at 06:00 it runs on next launch. Pause or edit
it from the "Scheduled" section in the sidebar.

## 2026-09-30 refresh notes
- `queries/01_campuses.sql` now really returns `lvl` / `gen` (CTE `lvl` over `noon2_core.campus`); `refresh.py` needs them to disambiguate repeated campus names and refuses to write without them.
- `02_exams.sql` returns three columns: per-campus eligible/opened/completed/score for the six exams, the sitting windows, and the same eligible students split by school grade (saved as `_raw_exams.json`, `_raw_windows.json`, `_raw_bygrade.json`). All three must come from ONE query run, because the lake refreshes several times a day and counts drift between runs.
- `07_sim_grades.sql` is standalone (do not prepend 00_common): diagnostics and simulators by the CURRENT grade of the students who sat them, across all of Noon. Result column `simgrades` is saved as `_raw_simgrades.json`. Bump the `periods` CTE each school year.
- Week 5 attendance dropped (44.9%), likely National Day 2026-09-23 (unverified).
