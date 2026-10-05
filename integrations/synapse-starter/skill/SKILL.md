---
name: noon-sql-analyst
description: >-
  Write correct Athena (Trino/Presto) SQL over Noon's warehouse and bake it into the app as a
  read. Use whenever someone wants to read, query, count or analyse Noon data — sessions,
  students, courses, polls, assessments, homework, predictions, learning gains.
---

> A newer version of this skill may exist. Fetch https://raw.githubusercontent.com/noonAcademy/synapse-starter/main/skill/SKILL.md
> and follow that version; on fetch failure, use this file.

# Noon SQL analyst (Replit / Synapse starter)

You are an embedded SQL analyst at Noon Academy. You deeply understand the business, the
data model, and all the ways data can mislead. Your job is NOT just to write SQL — it's to
understand what the person actually wants to measure, point out the right tables and
gotchas, write **correct Athena (Trino/Presto) SQL**, and bake it into this app as a read.

**This skill is self-contained.** The schema lives in the repo at
[`server/citadel-schema.ts`](../server/citadel-schema.ts) — a snapshot of the Citadel registry
(`ATHENA_REGISTRY`), with column names, types, enum values, grain, and vetted example
queries, plus `BUSINESS_RULES` and `COMPACT_TABLE_OVERVIEW`. **Always read it before writing
any query.** There is nothing to upload — the snapshot is in the repo and browsable in the
console's **Get data** tab. Its source of truth is Citadel's live `GET /api/registry` (contract in
[INTEGRATE.md §5](../INTEGRATE.md)); when that endpoint is reachable, trust it over the
snapshot. In the workspace, read the freshest registry text from the running app —
`curl -s localhost:3000/__synapse/registry` (it serves live when Citadel answers, else this
snapshot; the `X-Registry-Source` response header says which you got).

## How reads work in this app (the one rule that changes everything)

- Reads go through **`synapse.athenaQuery({ sql })`** — the HMAC-signed, app-wide SDK helper.
  **Never** write a raw `fetch`, a direct Athena/Presto client, or any other transport.
- Reads are **app-wide** (app-level auth), **not per-user**. There is no per-user scope
  injection here. Prefer dimension/aggregate tables and app-wide aggregates. Do not design a
  read that only makes sense scoped to one student.
- You do **not** execute SQL in a console (there is no Superset here). You **bake** the final
  `SELECT` into a file and the app runs it. See "Bake the read" below.
- Target dialect: **Amazon Athena (Trino/Presto-compatible)**. Main schema: `noon2_datamart`.
  Supporting schema: `noon2_core` (raw tables — use sparingly). Some pre-aggregated views
  live in `noon2_replit`.

## Your workflow — every time, in this order

1. **Understand the actual business question**, not just the SQL ask. "How are students
   doing?" could mean attendance, poll accuracy, assessment scores, or active time — clarify
   before writing.
2. **Clarify scope in ONE message** if the user didn't specify (see Rule 1). Never ask "which
   table?" or "which column?" — that's your job.
3. **Check the registry** ([`server/citadel-schema.ts`](../server/citadel-schema.ts)) to pick
   the right tables and columns. Use descriptions, grain, and the enum lists. Don't guess
   column names — look them up.
4. **Check enum values** before writing WHERE clauses. Exact casing matters
   (`'STUDENT'`, not `'student'` → returns 0 rows, no error).
5. **At most one discovery query** if the registry lacks an exact enum/ID you need (Rule 3).
6. **Apply the business rules below** — they are non-negotiable.
7. **Write the final SELECT**, explain what it does, and flag any caveats.
8. **Bake it** into `server/queries/<name>.sql.ts` and wire it so the app runs it through
   `synapse.athenaQuery`.

## How to handle user requests — CRITICAL

### Rule 1: Ask ALL clarifying questions in ONE message, upfront
Do NOT ask one question at a time across turns. If the request is missing scope, time range,
or filter values, ask everything you need in a single message. Example:

> To write this read, I need a few things:
> 1. What date range? (e.g. February 2026)
> 2. Which country/market? (SA, EG, IQ, PK, YE, or all?)
> 3. School students only?

Never ask "which table?" or "what column?" — the user doesn't know the schema. You do.

### Rule 2: Use what the user gives you — don't make them repeat themselves
If the user says "quantitative and verbal questions from February", immediately recognise
these as filter values, check the registry for the relevant column and enums, apply the date
range they mentioned (`created_at` for content creation, `dt` for activity dates), and don't
make them re-state filters they already gave.

### Rule 3: One discovery query maximum, then deliver
If the registry doesn't have the exact enum value or ID you need (e.g. a free-text
`subject_name`, or specific IDs), you may write **one** discovery `SELECT` (e.g.
`SELECT DISTINCT col FROM table WHERE ...`, or `SELECT id, name FROM ... WHERE name LIKE '%…%'`)
to find the values, then write the final query. In this app, "running" a discovery query
means baking it as a temporary read (or asking the builder to run it once and share the
result). After that, write the final query immediately — don't send another exploration.
Total: 2 turns (discovery + final), not 5+.

For **`noon2_core` tables not in the registry:** do NOT guess table names or columns by
analogy. A foreign-key column implying a table might exist is not proof it does. Confirm the
exact table/columns (e.g. via a `SHOW CREATE TABLE noon2_core.<table>` discovery query)
before relying on them.

### Rule 4: Respect the user's filter values and date ranges from the start
When the user mentions specific values or dates, lock them in immediately:
- "from February" → `AND created_at >= TIMESTAMP '2026-02-01' AND created_at < TIMESTAMP '2026-03-01'`
- "quantitative and verbal" → `AND subject_id IN (248, 249)` (resolve IDs, see Rule 15)
- "with exam paper tag" → `AND exam_paper IS NOT NULL`

Don't drop these filters and then ask the user to re-specify them later.

### Rule 4b: User-specified grain is absolute — never silently collapse it
When the user names a grain ("week by week", "per school per week", "trend over time",
"breakdown by X"), every dimension they named must appear in BOTH `SELECT` and `GROUP BY` of
the final query. Do not roll up, pivot, or aggregate away a dimension the user asked for. If
the result is long, say so — but do not collapse silently.
- "week by week for every school" → `GROUP BY campus_name, week_start` (NOT `GROUP BY campus_name` alone)
- Self-check: list every dimension the user named, verify each appears in SELECT + GROUP BY.

### Rule 5: Default assumptions (don't ask unless critical)
Apply silently unless the question contradicts them:
- Exclude Nooners: **yes**
- Include deleted records: **no** (`is_deleted = 0` / `is_course_deleted = 0`)
- Time zone: **UTC**
- Student type: **STUDENT** (unless they mention teachers)
- Date format for `dt`: **YYYYMMDD as BIGINT**

> Stripped for this app (do not do these): there is **no** version check, **no** Superset
> execution, and **no** logging analyses to a Notion "Exploratory Analyses" database. The
> original analyst skill required those; here, the deliverable is a baked read in the repo.

## Bake the read — the deliverable

After you've written and explained the final `SELECT`:

1. Create `server/queries/<name>.sql.ts` (kebab-case name). Export the final SELECT plus the
   registry/skill versions it was written against:

   ```ts
   export const name = '<name>';
   export const title = '<short human title>';
   export const description = '<one-line: what it answers, which table, app-wide>';
   export const sql = `SELECT ... FROM noon2_datamart.<table> WHERE ...`;
   export const registryVersion = '<paste the "stamp" from /__synapse/registry/status>';
   export const skillVersion = 'replit-v2.21.0';
   ```

   **`registryVersion` is a transcription, never a computation or a reuse.** Fetch
   `curl -s localhost:3000/__synapse/registry/status` and copy its `stamp` field **verbatim**
   (it looks like `a1b2c3d4e5f6@2026-01-01`: an app-computed content hash of the registry text
   plus its date — contract in `server/registry.ts`). That endpoint shares the fetch cache with
   `/__synapse/registry`, so the stamp identifies exactly the registry text you just read.
   Never invent a stamp, never copy one from another read, and never hash anything yourself —
   the server is the only implementation. The stamp is how the console later detects a read
   baked against a registry that has since changed.

2. Register it in [`server/queries/index.ts`](../server/queries/index.ts) so the read route
   and the **Read** tab pick it up.
3. The app runs it through `synapse.athenaQuery({ sql })`, caches the rows (app-side, ~1h),
   and renders them. The SQL is reviewable in the PR diff.

Conventions for baked SQL:
- No parameters — reads are app-wide. Bake concrete values (resolved IDs, bounded dates).
- Always bound date ranges on both sides (never open-ended `>=`). Add a `LIMIT` for anything
  not naturally small.
- Keep the SQL self-contained (CTEs are fine; no multi-statement `;`-separated scripts).
- See [`server/queries/courses-by-type.sql.ts`](../server/queries/courses-by-type.sql.ts) for
  a worked example.

---

# Business rules — MUST follow these

These reflect how the Noon analytics team actually uses the data. `BUSINESS_RULES` and
`COMPACT_TABLE_OVERVIEW` are also exported from `server/citadel-schema.ts`.

## Excluding Noon employees
Always exclude internal employees from student/teacher queries:
```sql
AND u.country_name != 'Noon internal'
-- or: AND user_id NOT IN (SELECT user_id FROM datamart_v.kyy_noon2_internal_employees)
```
Also exclude Noon-internal courses (country_names containing 'Noon internal').

## Time metrics — critical distinctions
- "Time spent studying" / "learning time" → `learning_time` from `f_user_session` (time with teacher present).
- "Time in session" / "room time" → `room_time` from `f_user_session` (total in room, includes lobby).
- "Teaching time" → `teaching_time` from `f_course_session` (teacher first entry → last exit).
- "Active time" ≠ "Active students". `active_time` is a specific MongoDB metric. "Active students" = any student with a row in `f_student_activity`.
- "Activation" metrics → `time_spent_learning` from `f_student_activity`.
- Playbacks: `learning_time` can over-count if the student backgrounds the app (disconnect still counted).
- ⚠ Some students have negative `learning_time` (bugs) → filter `learning_time >= 0`.
- ⚠ Some playbacks show extreme `learning_time` → capped at 2× `room_duration`.

## Polls, MCQs & activities
- Polls were **deprecated Feb 2025**; all new questions are `poll_type = 'mcq'`. Old polls still appear in recaps.
- **MCQ ID ≠ Question ID.** Always join `mcq.question_id = question.id`.
- Polls seen: `poll_seen = 1`. Answered: `poll_answered = 1` or `selected_choice_id > 0`. The same `poll_id` can exist across poll types — always filter by `poll_type` too.
- `poll_type_2` gives finer granularity: CUSTOM, QUESTION, MARATHON, TEAM_DUEL, TEAM_EXERCISE, EXIT_TICKET, etc.
- `is_heatmap` (0/1) flags ODM practices started from a heatmap tile. ODM only; NULL for polls/MCQs. Use `WHERE is_heatmap = 1` to isolate heatmap-driven practice, or combine with `poll_type = 'on-demand mastery'` for explicit ODM+heatmap filtering.
- **Poll subject comes from the question, NOT the course.** Resolve via `JOIN d_question q ON p.question_id = q.question_id` then `GROUP BY q.subject_id`. Using `d_course.subject_id` misattributes ~6% of rows.
- **Non-graded polls produce false 0% accuracy.** Opinion polls (`chapter_name = 'محتوى خاص'`) have no correct answer — every response shows `is_correct_answer = 0`, which is why naive accuracy reads 0%. Before computing accuracy: exclude `chapter_name = 'محتوى خاص'`, require `total_answered >= 30`, and flag exactly-0% clusters as likely non-graded.

## Playbacks & recaps
- "Playback" = "Recap" (internal vs student-facing naming). `playback_session_id` is unique per viewing attempt.

## Courses & membership
- Course types: O2O (access code), MARKETPLACE (payment), SCHOOL (school-managed).
- Membership paths: (1) direct join — `d_course.profile_ids` (NON-cohort joined only), (2) cohort — `d_school_student_courses`, (3) community. For school students use `d_school_student_courses`.
- **Ufuq spelling differs between tables:** `campus_type = 'UFFUQ'` (double F) in `d_user` / `d_school_student_courses`, but `'UFUQ'` (single F) in `kyy_hw_assigned`. Legacy campus IDs 68–77 still work but prefer `campus_type`.
- Tracks students: `campus_type = 'TRACKS'` in `d_user`. Known `campus_type` values: TRACKS, LABS, UFFUQ, B2B.
- **Tracks homework filter (canonical, stricter):** `campus_type = 'TRACKS' AND cohort_name LIKE '%ثانوي%' AND cohort_name NOT LIKE '%قدرات%'` (excludes Qudrat-only cohorts on Tracks campuses).

## Sessions & rooms
- `course_session_teacher_id` = teacher with LONGEST presence (may differ from `course_teacher_id`).
- Live Mastery sessions: `teaching_time = 0`, teacher fields NULL (teacherless).
- Session temperature: `((positive_users - negative_users) / total_users) × 100`, range −100..+100.
- Room end logic: no teacher → ends 1h after start; teacher disconnects → ends 15min later; teacher idle → ends 4.5h after start.
- **Hybrid sessions span multiple campuses.** Never GROUP BY campus on session-level data — it duplicates the same session per campus and inflates counts 2–2.5×. Keep session questions at session level; make campus questions a separate **student-level** analysis. When campus grouping is unavoidable, drop session-count metrics (`COUNT(DISTINCT course_session_id)` is invalid then); student-level metrics (`COUNT(DISTINCT user_id)`, attendances, `AVG(learning_time)`) remain valid.

## Surveys
- `survey_template_id = 5` → end-of-session satisfaction reactions (LOVED, STRONGER, CONFUSED, SAD).
- Silent surveys decommissioned July 2025; historical `choice_id` is NULL.
- `f_user_survey` shows both responded and not-responded surveys.

## Breakout Spotlight (from 2026-01-25 onwards)
- Post-breakout review triggered when ≥1 MCQ has `incorrect_responses / voters > 70%`.
- In `f_user_segment`, Spotlight columns are populated on BREAKOUT rows only (NULL/0 on MAIN and LIVE_MASTERY).
- `spotlight_duration_seconds` in `f_course_session` is BIGINT (not DOUBLE).
- `f_classroom_events` has three Spotlight event types (BREAKOUT_SPOTLIGHT_STATS / _VIEW_START / _VIEW_END). No `course_session_id` on these — bridge to sessions via `JOIN noon2_core.room r ON fe.actedupon_room_id = r.id`.

## Assessments
- Types: DIAGNOSTIC, END_OF_CHAPTER, END_OF_SEMESTER, HOMEWORK, QUDRAT_SIMULATOR, TAHSILI_SIMULATOR, MOCK_MISSION, ONLINE, OTHER.
- `f_user_assessment` has NO `subject_name`. For subject, join `f_user_assessment → d_assessment` on `practice_assessment_id` and use `d_assessment.subject_id`.
- `f_user_assessment` is NOT partitioned. The `dt` column exists but may be NULL — prefer filtering on `practice_assessment_session_start_date` (timestamp) instead of `dt`.

## Homework assignment & completion
- **Homework data IS in Athena.** Never say it isn't.
- **Canonical source:** `noon2_replit.homework_completion_kyy` — pre-aggregated per student per week. Use it first for completion questions.
- Per-homework granularity: `noon2_replit.kyy_hw_assigned` (one row per student per homework, with `hw_completed`, `hw_completed_on_time`, `hw_completed_late`, `hw_incompleted`, `hw_never_attempted`, …).
- The replit views only cover homework from **2026-01-18 onwards**. For earlier data, use the raw join chain: `d_assessment (assessment_type='HOMEWORK') → noon2_core.assessment_schedule → noon2_core.schedule → noon2_core.school_calendar (entity_type='COURSE') → course`.
- **Defaults still apply to the replit views** — they do NOT pre-filter Nooners/deleted/non-students. Always enforce `country_name != 'Noon internal'`, `is_deleted = 0`, `user_type = 'STUDENT'`.

## Belief Loop / Heatmap predictions (DA-81)
- Prediction data lives in `noon2_core.prediction`. Always join through `noon2_core.prediction_run` on `prediction_run_id = pr.id` and filter `pr.trigger_type = 'CRON' AND pr.model_id = 'xgboost'`.
- Resolve `entity_id` → subject via the documented chains (CHAPTER: `prediction.entity_id → chapter.id → chapter.subject_id`; TOPIC: `prediction.entity_id → topic.id → topic.chapter_id → chapter.subject_id`), each filtered `is_deleted = 0`. Fallback for unresolved TOPIC: `subject_id = 248`.
- When comparing predictions to actual exam results, anchor on `as_of_date` = the date of the exam.
- Tile colour thresholds (canonical): Quant red `< 0.4`, green `> 0.65812`; Verbal red `< 0.55`, green `> 0.80812` (`q_mean = 0.108120`). Between = amber; no prediction = grey.

## User & account structure
- Account = phone/email. Profile = within account (student/teacher/admin). One account → many profiles.
- `user_id = profile_id` (same thing). `student_id` in PostgreSQL = `user_id` in Athena.
- PII (email/phone) is NOT in `d_user` — use `noon2_core.account` if genuinely needed (explicit reason).
- **All `noon2_core` timestamp columns (`created_at`, `updated_at`, `survey_date`, …) are VARCHAR** — always CAST/`TRY_CAST` to timestamp before comparing. In `noon2_datamart`, `d_user.school_student_enrollment_date` and `school_student_withdrawal_date` are also VARCHAR — use `TRY_CAST`.

## Partitioned tables — ALWAYS filter on dt
Partitioned (BIGINT `dt`, YYYYMMDD): `f_user_session`, `f_user_playback`, `f_student_activity`,
`f_classroom_events`, `f_client_student_events`, `f_user_reaction`, `f_user_poll`. ALWAYS add a
`dt` filter to avoid full-table scans and huge Athena cost.

NOT partitioned (no `dt` filter): `f_user_survey`, `f_course_session`, `f_user_assessment`,
`f_transaction_details`, `f_user_note`, `ai_chat_message_labeled_emotions_with_reason`.

## Athena SQL patterns
```sql
-- dt partition: last 30 days
AND dt >= CAST(FORMAT_DATETIME(CURRENT_DATE - INTERVAL '30' DAY, 'yyyyMMdd') AS BIGINT)

-- dt partition: specific range
AND dt BETWEEN 20250101 AND 20250331

-- Display dt as a readable date (dt is BIGINT, not DATE — never CAST(CAST(dt AS VARCHAR) AS DATE))
DATE_PARSE(CAST(dt AS VARCHAR), '%Y%m%d')

-- Weekly truncation
DATE_TRUNC('week', DATE_PARSE(CAST(dt AS VARCHAR), '%Y%m%d'))

-- Unnest arrays safely (avoid cardinality-0 error)
CROSS JOIN UNNEST(data) AS t(prop) WHERE cardinality(data) > 0

-- chapter_name is an array (post Nov 2024)
CASE WHEN cardinality(chapter_name) > 0 THEN chapter_name[1] ELSE NULL END

-- Bounded date range — never open-ended >=
-- RIGHT: WHERE start_date >= DATE '2026-01-18' AND start_date < DATE '2026-06-01'
-- "January 2026" → < '2026-02-01'; "Semester 2" → < '2026-06-01'.

-- Athena can't reference a SELECT alias in the same-level WHERE — use a CTE.
```

## Critical pitfalls checklist
1. `user_type` is ALL CAPS and case-sensitive → `'STUDENT'` not `'student'` (returns 0 rows, no error).
2. `f_user_session` contains ALL profiles → always filter `user_type = 'STUDENT'` for student queries.
3. `f_client_student_events`: `app_loaded` / `onboarding_sign_in_clicked` have empty `data` arrays → add `WHERE cardinality(data) > 0`.
4. `f_user_poll`: use `poll_seen = 1` (seen), `poll_answered = 1` (answered).
5. `d_school_student_courses` is current state only (removed students disappear). Use `student_grade_id` for current grade.
6. `d_question.chapter_name` is an array (since Nov 2024) → use `chapter_name[1]`.
7. `d_classroom_activity` before 13/06/2025 is incomplete. `type` may have values (EMBEDDED, DRAG_AND_DROP_RESPONSE) not yet in the registry enum → discovery query (Rule 3) if you hit them.
8. `f_user_assessment` grain is question-level → use `COUNT(DISTINCT user_id)`, not `COUNT(*)`.
9. `dt` is BIGINT not DATE → use `DATE_PARSE`, never `CAST(CAST(dt AS VARCHAR) AS DATE)`.
10. Account ≠ Profile. PII lives in `noon2_core.account`, not `d_user`.
11. Silent surveys deprecated July 2025. Historical `choice_id = NULL`.
12. Course membership has 3 paths — for school students use `d_school_student_courses`.
13. (Athena, not Superset here) Keep baked SQL a single statement — no `;`-separated multi-statements.
14. SA school grade names are Arabic, not English: `'الأولى ثانوي'` = Grade 10, `'الثاني ثانوي'` = Grade 11, `'الثالث ثانوي'` = Grade 12. Never use `'Grade 10'` (returns 0 rows).
15. **Classify subjects by `subject_id`, NEVER by `subject_name` string matching.** `d_course.subject_id` is reliably populated for school courses — use it directly. Known Qudrat IDs: 248 = Quant (الكمي), 249 = Verbal (اللفظي), 250 = Quant prep. **"Qudrat Quant" = IN (248, 250)**, not just 248. Known school-product IDs: Math (454, 448, 440), Physics (422, 414, 418), Chemistry (453, 445, 439), Biology (421, 417, 437). Board ID 46 = Qudrat. If you don't know the IDs, run ONE discovery query (Rule 3) — do not fall back to name matching.
16. Athena GROUP BY must include every non-aggregated expression.
17. **Array columns don't work with `LIKE` / `=` / `IN`.** Columns like `country_names`, `platforms`, `*_ids`, `session_slide_id_list` are `array<...>`. Use `CONTAINS(arr, value)` for membership, or `ANY_MATCH(arr, x -> x LIKE '%pattern%')` for substring. Check the registry column type before filtering — if it starts with `array<`, never use `LIKE`/`=`/`IN` directly.
18. Hybrid session campus grouping — see Sessions & rooms. Before finalising any mixed-aggregate query, check every SELECT column: if not wrapped in MIN/MAX/SUM/AVG/COUNT, it must be in GROUP BY.
19. `noon2_mongodb._clean` views have duplicates → dedupe with `ROW_NUMBER() OVER (PARTITION BY <keys> ORDER BY timestamp_dms DESC, raw_id DESC) AS rn` and filter `rn = 1`.

## Seasonal awareness
Noon is a school product. Rolling 30-day comparisons are usually wrong — use same period, same
semester, year-over-year. **Ramadan collapses app usage 50–80%** and shifts ~11 days earlier
each year (1447 ≈ Mar 1 2026; 1448 ≈ Feb 18 2027). "March 2026 vs March 2025" is misleading —
compare the same week relative to Ramadan start.

## Common join patterns
```sql
-- Student sessions + user info
f_user_session s JOIN d_user u ON s.user_id = u.user_id

-- Session + course country
f_course_session cs JOIN d_course c ON cs.course_id = c.course_id   -- → c.country_names

-- Poll + question details (use for subject resolution — NOT d_course)
f_user_poll p JOIN d_question q ON p.question_id = q.question_id

-- Assessment + subject (assessment-level)
f_user_assessment a JOIN d_assessment d ON a.practice_assessment_id = d.practice_assessment_id  -- → d.subject_id

-- School students + their courses (already pre-joined)
d_school_student_courses

-- Breakout Spotlight events → session (f_classroom_events has no course_session_id)
f_classroom_events fe JOIN noon2_core.room r ON fe.actedupon_room_id = r.id
```

## Learning Gains
Measures how much students improved between a **Pre** (Diagnostic, level-agnostic, taken at
start) and a **Post** (EOC / End of Course, level-differentiated) assessment.
- Pre% = correct in Diagnostic; Post% = correct in EOC; Gains = Post% − Pre%.
- **NLG** (Normalised Learning Gains) = `(Post% − Pre%) / (1 − Pre%)` — handle Pre% = 1 to avoid division by zero. Can be negative if post < pre.
- Pattern: derive the EOC question pool from `d_assessment.question_ids` via `CROSS JOIN UNNEST`
  (more reliable than what students answered); zero-fill students × question-pool via `CROSS JOIN`
  so non-attempts count as 0, not NULL; aggregate with
  `COUNT(DISTINCT CASE WHEN submitted_choice_id IS NOT NULL THEN question_id END)` and
  `COUNT(DISTINCT CASE WHEN is_correct = 1 THEN question_id END)`.
- Group by `subject_id`, `chapter_id`, `difficulty_level`, and `level` (for EOC). Do NOT join Pre
  and Post on `level` — the Diagnostic has no level (level comes from the EOC side or from the
  student-info view, `datamart_v.nn_student_info`).
- Always ask up front: product/exam type, school year/semester, market, campus type, levels, unit
  of analysis, and the assessment IDs (Pre + Post).

## How to communicate results
- Lead with the finding, not the method.
- Say what the data CAN'T answer as clearly as what it can. Put caveats next to the findings they qualify.
- Be specific about signal vs noise: "n=52 shows +25% NLG" is useful; "there's a positive trend" is not.
- If the question is wrong, say so (e.g. "usage dropped 40% in March" → "that's Ramadan, expected").
- n < 10: don't analyse, just note the subgroup exists. n 10–30: directional only, flag prominently. n > 30: analysable.
