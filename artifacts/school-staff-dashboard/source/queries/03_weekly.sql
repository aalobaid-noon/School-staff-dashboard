-- weekly series at manager grain, complete weeks only: one JSON row.
-- Append after 00_common.sql. Uses its own dt-bounded CTEs so the partial
-- current week is excluded ({{DT_TO_WK}} = last day of the last complete week).
, ms AS (SELECT DISTINCT m.manager_id AS mid, s.user_id FROM stu s JOIN mgr m ON m.campus_id = s.campus_id),
mn AS (SELECT DISTINCT cm.profile_id AS mid, p.name AS mname
       FROM noon2_core.campus_managers cm
       JOIN noon2_core.profile p ON p.id = cm.profile_id AND p.is_deleted = 0 AND p.user_type = 'SCHOOL_MANAGER'
       WHERE cm.role = 'PRINCIPAL'),
attw AS (
  SELECT DISTINCT user_id, course_id, course_session_id,
         CAST(FLOOR(DATE_DIFF('day', {{TERM}}, DATE_PARSE(CAST(dt AS VARCHAR),'%Y%m%d'))/7) AS INT)+1 AS wk
  FROM noon2_datamart.f_user_session
  WHERE dt BETWEEN {{DT_FROM}} AND {{DT_TO_WK}} AND user_type = 'STUDENT' AND learning_time > 0
),
livew AS (SELECT DISTINCT user_id, course_id FROM attw),
sessw AS (
  SELECT course_session_id, course_id,
         CAST(FLOOR(DATE_DIFF('day', {{TERM}}, CAST(course_session_scheduled_start_time AS DATE))/7) AS INT)+1 AS wk
  FROM noon2_datamart.f_course_session
  WHERE is_course_session_deleted = 0 AND is_course_deleted = 0 AND course_session_status = 'ended'
    AND course_session_scheduled_start_time >= {{START}} AND course_session_scheduled_start_time < {{END_WK}}
),
expw AS (SELECT l.user_id, s.course_session_id, s.wk FROM livew l JOIN sessw s ON s.course_id = l.course_id),
aw AS (
  SELECT ms.mid, x.wk, COUNT(*) AS exp_n,
         SUM(CASE WHEN a.user_id IS NOT NULL THEN 1 ELSE 0 END) AS att_n,
         COUNT(DISTINCT CASE WHEN a.user_id IS NOT NULL THEN x.user_id END) AS act_n
  FROM expw x JOIN ms ON ms.user_id = x.user_id
  LEFT JOIN attw a ON a.user_id = x.user_id AND a.course_session_id = x.course_session_id
  GROUP BY 1,2
),
ew AS (
  SELECT ms.mid, CAST(FLOOR(DATE_DIFF('day', {{TERM}}, DATE_PARSE(CAST(p.dt AS VARCHAR),'%Y%m%d'))/7) AS INT)+1 AS wk,
         SUM(CASE WHEN p.is_correct_answer = 1 THEN 1 ELSE 0 END) AS c,
         SUM(CASE WHEN p.is_correct_answer IS NOT NULL THEN 1 ELSE 0 END) AS g,
         COUNT(DISTINCT CASE WHEN p.is_correct_answer IS NOT NULL THEN p.user_id END) AS etn
  FROM noon2_datamart.f_user_poll p JOIN ms ON ms.user_id = p.user_id
  WHERE p.dt BETWEEN {{DT_FROM}} AND {{DT_TO_WK}} AND p.poll_type_2 = 'EXIT_TICKET' AND p.poll_seen = 1
  GROUP BY 1,2
),
tw AS (
  SELECT ms.mid, CAST(FLOOR(DATE_DIFF('day', {{TERM}}, CAST(v.survey_datetime AS DATE))/7) AS INT)+1 AS wk,
         COUNT(DISTINCT v.user_id) AS n,
         AVG(CASE v.choice WHEN 'EXCELLENT' THEN 5.0 WHEN 'GOOD' THEN 4.0 WHEN 'OK' THEN 3.0
                           WHEN 'BAD' THEN 2.0 WHEN 'VERY_BAD' THEN 1.0 END) AS s
  FROM noon2_datamart.f_user_survey v JOIN ms ON ms.user_id = v.user_id
  WHERE v.user_type = 'STUDENT' AND v.survey_type = 'Trust' AND v.responded = 1
    AND v.survey_datetime >= {{START}} AND v.survey_datetime < {{END_WK}}
  GROUP BY 1,2
)
SELECT json_format(CAST(ARRAY_AGG(CAST(ROW(
    a.mid, mn.mname, a.wk, a.act_n, ROUND(100.0*a.att_n/NULLIF(a.exp_n,0),1),
    ROUND(100.0*e.c/NULLIF(e.g,0),1), COALESCE(e.etn,0),
    COALESCE(t.n,0), ROUND(100.0*t.s/5.0,1)
  ) AS ROW(mid BIGINT, mname VARCHAR, wk INT, act BIGINT, att DOUBLE, etq DOUBLE,
           etn BIGINT, tn BIGINT, tr DOUBLE))) AS JSON)) AS weekly
FROM aw a
JOIN mn ON mn.mid = a.mid
LEFT JOIN ew e ON e.mid = a.mid AND e.wk = a.wk
LEFT JOIN tw t ON t.mid = a.mid AND t.wk = a.wk
