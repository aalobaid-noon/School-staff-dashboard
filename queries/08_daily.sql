-- daily series per campus, from the first school day: one JSON row. Append after 00_common.sql.
-- Every column is ADDITIVE (counts, never rates), so the dashboard can sum any set of campuses and
-- divide once: attendance = att_n / exp_n, ticket closure = ans / seen, correctness = cor / gra.
--   exp_n  attendance slots that day: students x sessions that ended that day, for the courses the
--          student actually attends (same "real timetable" rule as every other attendance figure)
--   att_n  how many of those slots were attended
--   seen / ans / cor / gra  exit tickets seen, answered, correct, gradable that day
-- A session counts on the day it was scheduled; a ticket on the day it was shown.
, sessd AS (
  SELECT course_session_id, course_id, CAST(course_session_scheduled_start_time AS DATE) AS d
  FROM noon2_datamart.f_course_session
  WHERE is_course_session_deleted = 0 AND is_course_deleted = 0 AND course_session_status = 'ended'
    AND course_session_scheduled_start_time >= {{START}} AND course_session_scheduled_start_time < {{END}}
),
expday AS (SELECT l.user_id, s.course_session_id, s.d FROM live l JOIN sessd s ON s.course_id = l.course_id),
ad AS (
  SELECT st.campus_id, x.d, COUNT(*) AS exp_n,
         SUM(CASE WHEN a.user_id IS NOT NULL THEN 1 ELSE 0 END) AS att_n
  FROM expday x JOIN stu st ON st.user_id = x.user_id
  LEFT JOIN att a ON a.user_id = x.user_id AND a.course_session_id = x.course_session_id
  GROUP BY 1, 2
),
ed AS (
  SELECT st.campus_id, CAST(DATE_PARSE(CAST(p.dt AS VARCHAR), '%Y%m%d') AS DATE) AS d,
         COUNT(*) AS seen,
         SUM(CASE WHEN p.poll_answered = 1 THEN 1 ELSE 0 END) AS ans,
         SUM(CASE WHEN p.is_correct_answer = 1 THEN 1 ELSE 0 END) AS cor,
         SUM(CASE WHEN p.is_correct_answer IS NOT NULL THEN 1 ELSE 0 END) AS gra
  FROM noon2_datamart.f_user_poll p JOIN stu st ON st.user_id = p.user_id
  WHERE p.dt BETWEEN {{DT_FROM}} AND {{DT_TO}} AND p.poll_type_2 = 'EXIT_TICKET' AND p.poll_seen = 1
  GROUP BY 1, 2
)
SELECT json_format(CAST(ARRAY_AGG(CAST(ROW(
    COALESCE(a.campus_id, e.campus_id),
    CAST(date_format(CAST(COALESCE(a.d, e.d) AS TIMESTAMP), '%Y%m%d') AS INTEGER),
    COALESCE(a.exp_n, 0), COALESCE(a.att_n, 0),
    COALESCE(e.seen, 0), COALESCE(e.ans, 0), COALESCE(e.cor, 0), COALESCE(e.gra, 0)
  ) AS ROW(cid BIGINT, d INTEGER, exp_n BIGINT, att_n BIGINT, seen BIGINT, ans BIGINT, cor BIGINT, gra BIGINT))) AS JSON)) AS daily
FROM ad a
FULL OUTER JOIN ed e ON e.campus_id = a.campus_id AND e.d = a.d
