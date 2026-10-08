-- campuses: one JSON row. Append after 00_common.sql
, meta AS (
  SELECT campus_id, MAX(campus_name) AS campus_name, MAX(campus_type) AS campus_type,
         COUNT(DISTINCT facilitator_id) AS facilitators, COUNT(DISTINCT user_id) AS enrolled
  FROM d GROUP BY campus_id
),
lvl AS (SELECT id AS campus_id, school_level AS lvl, allowed_gender AS gen FROM noon2_core.campus),
mc AS (SELECT campus_id, ARRAY_JOIN(ARRAY_AGG(CAST(manager_id AS VARCHAR)), ',') AS mgr_ids FROM mgr GROUP BY campus_id),
attagg AS (
  SELECT s.campus_id, COUNT(*) AS exp_n,
         SUM(CASE WHEN a.user_id IS NOT NULL THEN 1 ELSE 0 END) AS att_n,
         COUNT(DISTINCT x.user_id) AS active_n
  FROM expd x JOIN stu s ON s.user_id = x.user_id
  LEFT JOIN att a ON a.user_id = x.user_id AND a.course_session_id = x.course_session_id
  GROUP BY s.campus_id
),
etagg AS (SELECT s.campus_id, SUM(e.seen) AS seen, SUM(e.answered) AS answered,
                 SUM(e.correct) AS correct, SUM(e.gradable) AS gradable
          FROM stu s JOIN etu e ON e.user_id = s.user_id GROUP BY s.campus_id),
clagg AS (SELECT s.campus_id, COUNT(DISTINCT c.user_id) AS etn, ROUND(AVG(c.acc),1) AS etqs
          FROM stu s JOIN closer c ON c.user_id = s.user_id GROUP BY s.campus_id),
tragg AS (SELECT s.campus_id, COUNT(DISTINCT t.user_id) AS n, AVG(t.s) AS avg_s
          FROM stu s JOIN tru t ON t.user_id = s.user_id GROUP BY s.campus_id)
SELECT json_format(CAST(ARRAY_AGG(CAST(ROW(
    m.campus_id, m.campus_name, m.campus_type, COALESCE(mc.mgr_ids,''), m.facilitators, m.enrolled,
    COALESCE(a.active_n,0), m.enrolled - COALESCE(a.active_n,0),
    ROUND(100.0*a.att_n/NULLIF(a.exp_n,0),1), ROUND(100.0*e.answered/NULLIF(e.seen,0),1),
    ROUND(100.0*e.correct/NULLIF(e.gradable,0),1), COALESCE(cl.etn,0), cl.etqs,
    COALESCE(t.n,0), ROUND(100.0*t.avg_s/5.0,1), lv.lvl, lv.gen
  ) AS ROW(id BIGINT, name VARCHAR, type VARCHAR, mgr VARCHAR, facs BIGINT, enr BIGINT,
           act BIGINT, never BIGINT, att DOUBLE, etc DOUBLE, etq DOUBLE,
           etn BIGINT, etqs DOUBLE, tn BIGINT, tr DOUBLE, lvl VARCHAR, gen VARCHAR))) AS JSON)) AS campuses
FROM meta m
LEFT JOIN mc ON mc.campus_id = m.campus_id
LEFT JOIN lvl lv ON lv.campus_id = m.campus_id
LEFT JOIN attagg a ON a.campus_id = m.campus_id
LEFT JOIN etagg  e ON e.campus_id = m.campus_id
LEFT JOIN clagg  cl ON cl.campus_id = m.campus_id
LEFT JOIN tragg  t ON t.campus_id = m.campus_id
