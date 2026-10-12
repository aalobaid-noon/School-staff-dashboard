# noon · School Manager Dashboard

Executive dashboard for school managers, built on **live data from the Noon data lake**.
Arabic-first, RTL, with an EN toggle.

**Press (noon-only):** https://press.noon.edu.sa/p/school-manager-dashboard/
**Artifact (private):** https://claude.ai/code/artifact/a36f95cc-caca-45cc-8241-dac033be8a76

## Scope of the current extract

| | |
|---|---|
| Source | Athena — `noon2_datamart`, `noon2_core`, business rules `rules-29acaca6df81` |
| Pulled | 2026-09-30 |
| Window | 2026-08-23 → 2026-09-30 (school year 2026/2027). Headline metrics span the whole window; the weekly series covers complete weeks 1–5, so the partial week 6 never becomes a comparison point. |
| Population | Saudi TRACKS + UFFUQ campuses that have a registered school manager |
| Size | 10 managers · 41 school leads · 66 campuses · 190 facilitators · 5,051 students |

Nothing in the dashboard is simulated.

## Files

| Path | What it is |
|---|---|
| `src/app.html` | The source. Markup + CSS + JS with a `/*__DATA__*/` marker. **Edit this.** |
| `data/real.json` | The extract. Replace this to refresh the dashboard. |
| `merge_closers.py` | Merges the per-student exit-ticket metric into the extract. |
| `merge_leads.py` | Merges the School Lead layer into the extract. |
| `merge_students.py` | Merges the student-gap list (drill-down) into the extract. |
| `build.py` | Injects the data and emits both outputs. |
| `build_press.py` | Splits the page into <20 KB files (only needed for inline publishing). |
| `press4/` | The 4-file bundle published to Press. |
| `manager-dashboard.html` | Standalone, double-clickable. |
| `dist/artifact.html` | Body-only, for publishing as an Artifact. |

```bash
python3 build.py
```

## Metric definitions

- **Attendance** — sessions attended ÷ sessions of the courses the student *actually
  studies* in the window. Catalogue-only enrolments are excluded: some students carry
  up to 33 course rows with no timetable, and including them dragged the network figure
  down to 14% against a true ~57%.
- **Never attended** — enrolled students with zero sessions all year. A separate,
  deliberately un-blended number: it is an enrolment/access problem, not an attendance one.
- **Hierarchy** — `SCHOOL_MANAGER → SCHOOL_LEAD → FACILITATOR → STUDENT`. All three upper
  roles sit in `noon2_core.campus_managers` with `role = 'PRINCIPAL'`, told apart by
  `profile.user_type`. Lead↔campus is many-to-many like manager↔campus: 40 leads over 71
  assignments, 8 campuses carry two leads, and **3 campuses have no lead at all** (flagged).
- **Exit tickets** — three figures, because they answer different questions:
  - *closure* = answered ÷ seen — ~98.7% network-wide, does not discriminate;
  - *correctness* (`etq`) = correct ÷ gradable across all answers — weights heavy answerers more;
  - *per-student correctness* (`etqs`) = mean of each closer's own accuracy, every student
    counted once, over the 4,931 of 5,033 students who closed at least one ticket.
  Network-wide the two correctness figures are 58.2% and 57.5%; they diverge per school.
- **Trust** — the weekly `Trust` survey ("كيف تقيم تجربتك خلال هذا الأسبوع؟"),
  EXCELLENT/GOOD/OK/BAD/VERY_BAD mapped to 5..1 then to a percentage.
- **Exams — six, each on its own.** Qudrat Diagnostics 2026, ESL Diagnostic - August 2026,
  Tahsili Diagnostics 2026, NAFES Science (30 q), NAFES Math + Arabic (35 q, two subjects in
  one sitting) and the third-intermediate first-term diagnostic (45 q). **Not every student
  sits every exam**: a student is *eligible* for an exam if it is scheduled on their class,
  or they are enrolled in its programme, or they already sat it. Every rate is over that
  eligible set only, so a middle school (no Qudrat / ESL / Tahsili by design) is never
  counted as "missing" them. Opened = entered ÷ eligible. Completed = answered 90%+ ÷ eligible.
  Score = over completers. Each exam also carries its own sitting window (`META.exam_windows`),
  so the dashboard says whether it is still open, closes today, or already closed — and the
  suggested action changes accordingly (finish it now vs. ask for an extension).
  Insights, issues, actions, wins and KPIs are all emitted per exam and always name the
  school; the Exams tab has an overview table and one section per exam.

## Drill-down

One list per exam opens by name (students **eligible for that exam who never opened it**), plus **never attended**. Each row carries student · school · grade · class · lead · facilitator, with
search, a copy-to-clipboard button, and a strip at the top showing the five schools the
problem concentrates in (count and share of that school). Counts move with the daily refresh.

## Known limits

1. **The weekly series is stored at manager grain**, so week-over-week deltas disappear
   when you filter to one school or facilitator. Widen the filter to see them.
2. **Headline value ≠ delta measure.** The big number is the average over the whole
   3-week window; the delta compares week 3 to week 2. The chip labels which weeks it
   spans and shows the week-3 value underneath.
3. **Week 1 is orientation week** — almost no sessions ran, so comparing against it
   is not meaningful. Default comparison is week 2.
4. **Student rows cover gaps only** — the 1,422 students with at least one gap, not all
   5,033. The data-lake MCP caps at 20 rows per call, so results are returned as one JSON
   row; a full roster would need a bulk export. When a payload is too large to read back
   safely, the refresh appends a large pad column so the harness spills the result to a
   file, which is then parsed — never transcribed by hand.
5. **Trust coverage** — 3 of 66 campuses have zero survey responses, so their trust cell
   is empty rather than low; the dashboard flags this as a coverage gap. This was 27 of 66
   in the 2026-09-13 extract — the survey has since reached almost every school.
6. Data-lake tables refresh roughly every 12 hours, so figures can lag production
   by up to half a day.

## Refreshing

Re-run the queries (they are reproduced in the session transcript), overwrite
`data/real.json`, then `python3 build.py`. The page shape does not change.

## Design notes

- Palette and tokens follow the existing noon system in `../Noon Case/index.html`.
- Status text uses darkened variants (`--green-t`, `--amber-t`, `--red-t`) — the fill
  colours are below 4.5:1 on cream and fail as text.
- Trends are **small multiples, one hue each**, not overlaid lines: the five-hue
  categorical set fails all-pairs CVD separation, so faceting is the correct fix.
- Charts run left→right in both directions; axis labels are forced `dir="ltr"` so they
  do not invert against the plot under RTL.
- Rates are rolled up with **weighted** means (attendance by active students, exit
  tickets by enrolment, trust by respondents, exam scores by completers) — never a
  mean of means.

## Publishing to Press

`press4/` holds the deployed bundle: `index.html`, `style.css`, `data.js`, `app.js`.
Regenerate it from `manager-dashboard.html`, then:

1. `begin_deploy` with slug `school-manager-dashboard` and the four sha256/bytes entries.
2. Press returns an upload URL — `data.js` and `app.js` exceed the 20 KB inline limit.
3. Upload the four files through that page (the browser pane cannot reach `localhost`
   from `press.noon.edu.sa`, so drive it from a signed-in Chrome).

The site is **noon-only**: signed-in nooners only, which is the right tier given it
carries real student names. Republishing keeps that visibility unless changed.
