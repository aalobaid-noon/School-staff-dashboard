-- Shared CTE prelude. Every refresh query below starts with this block.
-- Placeholders substituted by the runbook before execution:
--   {{START}}   first day of the extract window, e.g. TIMESTAMP '2026-08-23 00:00:00'
--   {{END}}     exclusive end,                  e.g. TIMESTAMP '2026-09-14 00:00:00'
--   {{DT_FROM}} same as START in dt form,       e.g. 20260823
--   {{DT_TO}}   same as END   in dt form,       e.g. 20260914
--   {{TERM}}    first day of term, for week numbering, e.g. DATE '2026-08-23'
--
-- Scope: Saudi TRACKS + UFFUQ campuses that have a SCHOOL_MANAGER (role PRINCIPAL).
-- Rules version pinned at pull time; re-fetch get_business_rules if it has moved.

WITH mgr AS (
  SELECT DISTINCT cm.profile_id AS manager_id, cm.campus_id
  FROM noon2_core.campus_managers cm
  JOIN noon2_core.profile p ON p.id = cm.profile_id AND p.is_deleted = 0 AND p.user_type = 'SCHOOL_MANAGER'
  WHERE cm.role = 'PRINCIPAL'
),
d AS (
  SELECT * FROM noon2_datamart.d_school_student_courses
  WHERE campus_country = 'Saudi Arabia' AND campus_type IN ('TRACKS','UFFUQ')
    AND student_status = 'ACTIVE' AND campus_id IN (SELECT campus_id FROM mgr)
),
stu AS (SELECT DISTINCT user_id, campus_id FROM d),
-- Noon-internal accounts. The business rules require excluding Noon employees via
-- d_user.country_name = 'Noon internal'. Careful: facilitators ARE Noon staff, and every
-- real one carries their own country ('Saudi Arabia') — only placeholder/utility accounts
-- carry 'Noon internal'. So this set is tiny and must NOT be used to filter students.
-- Verified 2026-09-21: exactly 1 of 195 in-scope facilitators is in it (profile 608478,
-- the shared account that also owns the profiles "فريق نون" and "Noon Facilitator").
nooner AS (SELECT DISTINCT user_id FROM noon2_datamart.d_user WHERE country_name = 'Noon internal'),
att AS (
  SELECT DISTINCT user_id, course_id, course_session_id
  FROM noon2_datamart.f_user_session
  WHERE dt BETWEEN {{DT_FROM}} AND {{DT_TO}} AND user_type = 'STUDENT' AND learning_time > 0
),
-- a student's real timetable = the courses they actually turn up to.
-- Catalogue-only enrolments (up to 33 course rows with no schedule) would otherwise
-- drag network attendance from ~57% down to ~14%.
live AS (SELECT DISTINCT user_id, course_id FROM att),
sess AS (
  SELECT course_session_id, course_id
  FROM noon2_datamart.f_course_session
  WHERE is_course_session_deleted = 0 AND is_course_deleted = 0 AND course_session_status = 'ended'
    AND course_session_scheduled_start_time >= {{START}}
    AND course_session_scheduled_start_time <  {{END}}
),
expd AS (SELECT l.user_id, s.course_session_id FROM live l JOIN sess s ON s.course_id = l.course_id),
etu AS (
  SELECT user_id,
         COUNT(*)                                                       AS seen,
         SUM(CASE WHEN poll_answered = 1 THEN 1 ELSE 0 END)             AS answered,
         SUM(CASE WHEN is_correct_answer = 1 THEN 1 ELSE 0 END)         AS correct,
         SUM(CASE WHEN is_correct_answer IS NOT NULL THEN 1 ELSE 0 END) AS gradable
  FROM noon2_datamart.f_user_poll
  WHERE dt BETWEEN {{DT_FROM}} AND {{DT_TO}} AND poll_type_2 = 'EXIT_TICKET' AND poll_seen = 1
  GROUP BY user_id
),
closer AS (SELECT user_id, 100.0*correct/gradable AS acc FROM etu WHERE gradable > 0),
tru AS (
  SELECT user_id, AVG(CASE choice WHEN 'EXCELLENT' THEN 5.0 WHEN 'GOOD' THEN 4.0 WHEN 'OK' THEN 3.0
                                  WHEN 'BAD' THEN 2.0 WHEN 'VERY_BAD' THEN 1.0 END) AS s
  FROM noon2_datamart.f_user_survey
  WHERE user_type = 'STUDENT' AND survey_type = 'Trust' AND responded = 1
    AND survey_datetime >= {{START}} AND survey_datetime < {{END}}
  GROUP BY user_id
),
-- ---------------------------------------------------------------------------------------
-- DIAGNOSTIC EXAMS. Six exams; NOT every student sits every one. Each is assigned to specific
-- classes (cohorts) or programmes, so every rate below is measured against the students the
-- exam was assigned to ("eligible"), never against the whole school.
--   Q Qudrat Diagnostics 2026            T Tahsili Diagnostics 2026     E ESL Diagnostic - August 2026
--   S NAFES Diagnostic - Science         M NAFES Diagnostic - Math + Arabic
--   P «امتحان تشخيصي: ثالث متوسط 2026: الفصل الدراسي الأول» (subject 588, third-intermediate)
-- Other DIAGNOSTIC-typed items (Intl_ formatives, math worksheets, test copies) are ignored.
da AS (
  SELECT DISTINCT practice_assessment_id, total_questions,
    CASE WHEN practice_assessment_title = 'Qudrat Diagnostics 2026'           THEN 'Q'
         WHEN practice_assessment_title = 'ESL Diagnostic - August 2026'      THEN 'E'
         WHEN practice_assessment_title = 'Tahsili Diagnostics 2026'          THEN 'T'
         WHEN practice_assessment_title = 'NAFES Diagnostic — Science'        THEN 'S'
         WHEN practice_assessment_title = 'NAFES Diagnostic — Math + Arabic'  THEN 'M'
         WHEN subject_id = 588 AND practice_assessment_title LIKE '%ثالث متوسط 2026%' THEN 'P' END AS ex
  FROM noon2_datamart.d_assessment
  WHERE assessment_type = 'DIAGNOSTIC'
    AND (practice_assessment_title IN ('Qudrat Diagnostics 2026','ESL Diagnostic - August 2026',
           'Tahsili Diagnostics 2026','NAFES Diagnostic — Science','NAFES Diagnostic — Math + Arabic')
         OR (subject_id = 588 AND practice_assessment_title LIKE '%ثالث متوسط 2026%'))
),
ua AS (
  SELECT a.user_id, da.ex, MAX(da.total_questions) AS tq,
    COUNT(DISTINCT CASE WHEN a.question_answered = 1 THEN a.question_id END) AS ans,
    COUNT(DISTINCT CASE WHEN a.is_correct = 1        THEN a.question_id END) AS cor
  FROM noon2_datamart.f_user_assessment a
  JOIN da ON da.practice_assessment_id = a.practice_assessment_id
  WHERE a.assessment_type = 'DIAGNOSTIC'
    AND a.assessment_start_time >= {{START}} AND a.assessment_start_time < {{END}}
  GROUP BY 1, 2
),
-- WHO an exam is assigned to. Verified 2026-09-30 against the lake:
--   (1) a schedule on the student's cohort   assessment_schedule -> schedule -> school_calendar
--       (entity_type 'COHORT', entity_id = cohort_id); schedule dates are TIMESTAMPs, not dates
--   (2) enrolment in the matching programme  datamart_v.yns_student_program
--       Qudrat = subjects 248/249 · Tahsili = 251/253/254 (252 is a different course) ·
--       ESL = 661/662/663 · NAFES Science = 518 · NAFES Math/Arabic = 517/519
--   (3) having actually sat it (so an off-list student is never scored as "not assigned")
-- The third-intermediate exam has no programme; it is assigned by cohort schedule only.
asg AS (
  SELECT DISTINCT da.ex, sc.entity_id AS cohort_id
  FROM da
  JOIN noon2_core.assessment_schedule a2 ON a2.practice_assessment_id = da.practice_assessment_id
  JOIN noon2_core.schedule s ON s.id = a2.schedule_id AND s.is_deleted = 0
  JOIN noon2_core.school_calendar sc ON sc.id = s.school_calendar_id AND sc.entity_type = 'COHORT'
),
enr AS (
  SELECT DISTINCT p.user_id,
    CASE WHEN p.program = 'Qudrat'                          THEN 'Q'
         WHEN p.program = 'Tahsili' AND p.subject_id <> 252 THEN 'T'
         WHEN p.program = 'ESL'                             THEN 'E'
         WHEN p.program = 'Nafes' AND p.subject_id = 518    THEN 'S'
         WHEN p.program = 'Nafes' AND p.subject_id IN (517, 519) THEN 'M' END AS ex
  FROM datamart_v.yns_student_program p
  JOIN stu s ON s.user_id = p.user_id
  WHERE p.school_year = '2026/2027'
),
elig AS (
  SELECT DISTINCT ex, user_id FROM (
    SELECT asg.ex, d.user_id FROM asg JOIN d ON d.cohort_id = asg.cohort_id
    UNION ALL SELECT ex, user_id FROM enr WHERE ex IS NOT NULL
    UNION ALL SELECT ex, user_id FROM ua
  ) t
  WHERE user_id IN (SELECT user_id FROM stu)
),
-- the dates each exam is open, across every non-deleted schedule
awin AS (
  SELECT da.ex, CAST(MIN(s.start_date) AS varchar) AS s0, CAST(MAX(s.end_date) AS varchar) AS e0
  FROM da
  JOIN noon2_core.assessment_schedule a2 ON a2.practice_assessment_id = da.practice_assessment_id
  JOIN noon2_core.schedule s ON s.id = a2.schedule_id AND s.is_deleted = 0
  GROUP BY da.ex
)
