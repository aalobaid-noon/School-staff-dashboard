-- exams per campus (and per campus x grade), measured against the students each exam is ASSIGNED to (see `elig` in
-- 00_common.sql). Append after 00_common.sql. Three JSON columns: exams (per campus), windows, bygrade (campus x grade x exam counts).
--   xn = eligible students (0/null = exam not assigned at this school)
--   xo = % of eligible who opened   xc = % who finished (>=90% answered)   xs = score % of finishers
, j AS (
  SELECT s.campus_id, e.ex, s.user_id, u.cor, u.tq,
         gr.g,
         CASE WHEN u.user_id IS NOT NULL THEN 1 ELSE 0 END AS opened,
         CASE WHEN u.ans >= 0.9*u.tq THEN 1 ELSE 0 END AS fin
  FROM stu s
  JOIN elig e ON e.user_id = s.user_id
  LEFT JOIN (SELECT user_id, campus_id, MAX(student_grade_name) AS g FROM d GROUP BY 1, 2) gr
    ON gr.user_id = s.user_id AND gr.campus_id = s.campus_id
  LEFT JOIN ua u ON u.user_id = s.user_id AND u.ex = e.ex
),
pe AS (
  SELECT campus_id, ex, COUNT(DISTINCT user_id) AS n,
    ROUND(100.0*SUM(opened)/COUNT(*),1) AS o,
    ROUND(100.0*SUM(opened*fin)/COUNT(*),1) AS c,
    ROUND(100.0*SUM(CASE WHEN opened=1 AND fin=1 THEN cor END)
                /NULLIF(SUM(CASE WHEN opened=1 AND fin=1 THEN tq END),0),1) AS scr
  FROM j GROUP BY campus_id, ex
),
pg AS (
  SELECT campus_id, COALESCE(g, '') AS g, ex, COUNT(DISTINCT user_id) AS n, SUM(opened) AS o, SUM(opened*fin) AS c,
    ROUND(100.0*SUM(CASE WHEN opened=1 AND fin=1 THEN cor END)
                /NULLIF(SUM(CASE WHEN opened=1 AND fin=1 THEN tq END),0),1) AS scr
  FROM j GROUP BY campus_id, COALESCE(g, ''), ex
),
per AS (
  SELECT campus_id,
  MAX(CASE WHEN ex='Q' THEN n END) AS qn,
  MAX(CASE WHEN ex='Q' THEN o END) AS qo,
  MAX(CASE WHEN ex='Q' THEN c END) AS qc,
  MAX(CASE WHEN ex='Q' THEN scr END) AS qs,
  MAX(CASE WHEN ex='E' THEN n END) AS en,
  MAX(CASE WHEN ex='E' THEN o END) AS eo,
  MAX(CASE WHEN ex='E' THEN c END) AS ec,
  MAX(CASE WHEN ex='E' THEN scr END) AS es,
  MAX(CASE WHEN ex='T' THEN n END) AS tn,
  MAX(CASE WHEN ex='T' THEN o END) AS t_o,
  MAX(CASE WHEN ex='T' THEN c END) AS tc,
  MAX(CASE WHEN ex='T' THEN scr END) AS ts,
  MAX(CASE WHEN ex='S' THEN n END) AS sn,
  MAX(CASE WHEN ex='S' THEN o END) AS so,
  MAX(CASE WHEN ex='S' THEN c END) AS sc,
  MAX(CASE WHEN ex='S' THEN scr END) AS ss,
  MAX(CASE WHEN ex='M' THEN n END) AS mn,
  MAX(CASE WHEN ex='M' THEN o END) AS mo,
  MAX(CASE WHEN ex='M' THEN c END) AS mc,
  MAX(CASE WHEN ex='M' THEN scr END) AS ms,
  MAX(CASE WHEN ex='P' THEN n END) AS pn,
  MAX(CASE WHEN ex='P' THEN o END) AS po,
  MAX(CASE WHEN ex='P' THEN c END) AS pc,
  MAX(CASE WHEN ex='P' THEN scr END) AS ps
  FROM pe GROUP BY campus_id
)
SELECT
  (SELECT json_format(CAST(ARRAY_AGG(CAST(ROW(campus_id,qn,qo,qc,qs,en,eo,ec,es,tn,t_o,tc,ts,sn,so,sc,ss,mn,mo,mc,ms,pn,po,pc,ps)
    AS ROW(id BIGINT, qn BIGINT, qo DOUBLE, qc DOUBLE, qs DOUBLE, en BIGINT, eo DOUBLE, ec DOUBLE, es DOUBLE, tn BIGINT, "to" DOUBLE, tc DOUBLE, ts DOUBLE, sn BIGINT, so DOUBLE, sc DOUBLE, ss DOUBLE, mn BIGINT, mo DOUBLE, mc DOUBLE, ms DOUBLE, pn BIGINT, po DOUBLE, pc DOUBLE, ps DOUBLE))) AS JSON)) FROM per) AS exams,
  (SELECT json_format(CAST(ARRAY_AGG(CAST(ROW(ex, s0, e0)
    AS ROW(ex VARCHAR, s VARCHAR, e VARCHAR))) AS JSON)) FROM awin) AS windows,
  (SELECT json_format(CAST(ARRAY_AGG(CAST(ROW(campus_id, g, ex, n, o, c, scr)
    AS ROW(id BIGINT, g VARCHAR, ex VARCHAR, n BIGINT, o BIGINT, c BIGINT, s DOUBLE))) AS JSON)) FROM pg) AS bygrade
