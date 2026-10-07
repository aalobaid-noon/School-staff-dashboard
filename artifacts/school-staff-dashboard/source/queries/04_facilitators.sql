-- facilitators (>=5 students) per campus: one JSON row. Append after 00_common.sql
-- Placeholder accounts are excluded here, not just hidden: attributing a school's numbers
-- to a person who does not work there is the one error this layer must never make.
, fs AS (SELECT DISTINCT facilitator_id, campus_id, user_id FROM d
         WHERE facilitator_id IS NOT NULL AND facilitator_id NOT IN (SELECT user_id FROM nooner)),
fn AS (SELECT facilitator_id, MAX(facilitator_name) AS fname FROM d
       WHERE facilitator_id IS NOT NULL AND facilitator_id NOT IN (SELECT user_id FROM nooner)
       GROUP BY facilitator_id),
aa AS (
  SELECT f.facilitator_id, f.campus_id, COUNT(*) AS exp_n,
         SUM(CASE WHEN a.user_id IS NOT NULL THEN 1 ELSE 0 END) AS att_n,
         COUNT(DISTINCT x.user_id) AS act_n
  FROM expd x JOIN fs f ON f.user_id = x.user_id
  LEFT JOIN att a ON a.user_id = x.user_id AND a.course_session_id = x.course_session_id
  GROUP BY 1,2
),
ee AS (SELECT f.facilitator_id, f.campus_id, SUM(e.correct) AS c, SUM(e.gradable) AS g
       FROM fs f JOIN etu e ON e.user_id = f.user_id GROUP BY 1,2),
cc AS (SELECT f.facilitator_id, f.campus_id, COUNT(DISTINCT cl.user_id) AS etn, ROUND(AVG(cl.acc),1) AS etqs
       FROM fs f JOIN closer cl ON cl.user_id = f.user_id GROUP BY 1,2),
tt AS (SELECT f.facilitator_id, f.campus_id, COUNT(DISTINCT t.user_id) AS n, AVG(t.s) AS s
       FROM fs f JOIN tru t ON t.user_id = f.user_id GROUP BY 1,2),
base AS (SELECT facilitator_id, campus_id, COUNT(DISTINCT user_id) AS n FROM fs GROUP BY 1,2)
SELECT json_format(CAST(ARRAY_AGG(CAST(ROW(
    b.facilitator_id, fn.fname, b.campus_id, b.n, COALESCE(a.act_n,0),
    ROUND(100.0*a.att_n/NULLIF(a.exp_n,0),1), ROUND(100.0*e.c/NULLIF(e.g,0),1),
    COALESCE(cc.etn,0), cc.etqs, COALESCE(t.n,0), ROUND(100.0*t.s/5.0,1)
  ) AS ROW(fid BIGINT, fname VARCHAR, cid BIGINT, n BIGINT, act BIGINT, att DOUBLE,
           etq DOUBLE, etn BIGINT, etqs DOUBLE, tn BIGINT, tr DOUBLE))) AS JSON)) AS facilitators
FROM base b
JOIN fn ON fn.facilitator_id = b.facilitator_id
LEFT JOIN aa a  ON a.facilitator_id = b.facilitator_id AND a.campus_id = b.campus_id
LEFT JOIN ee e  ON e.facilitator_id = b.facilitator_id AND e.campus_id = b.campus_id
LEFT JOIN cc    ON cc.facilitator_id = b.facilitator_id AND cc.campus_id = b.campus_id
LEFT JOIN tt t  ON t.facilitator_id = b.facilitator_id AND t.campus_id = b.campus_id
WHERE b.n >= 5
