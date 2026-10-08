-- student gap list + school leads + orphan cohorts: one row, three JSON columns.
-- Append after 00_common.sql.
, prim AS (
  SELECT user_id, campus_id, cohort_name, facilitator_id, student_grade_name,
         ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY COUNT(*) DESC, cohort_name) AS rn
  FROM d GROUP BY user_id, campus_id, cohort_name, facilitator_id, student_grade_name
),
who AS (SELECT user_id, cohort_name, facilitator_id, student_grade_name FROM prim WHERE rn = 1),
nm  AS (SELECT user_id, MAX(user_name) AS user_name FROM d GROUP BY user_id),
anyatt AS (SELECT DISTINCT user_id FROM att),
-- Exam gaps are measured ONLY against the exams assigned to the student (`elig`, see 00_common.sql):
-- a student is flagged for an exam only if it was assigned to them and they never opened it.
-- bits: 1 never attended a session · 2 Qudrat · 4 ESL · 8 Tahsili · 32 NAFES Science · 64 NAFES Math+Arabic ·
--       128 third-intermediate diagnostic
miss AS (
  SELECT e.user_id,
         SUM(CASE e.ex WHEN 'Q' THEN 2 WHEN 'E' THEN 4 WHEN 'T' THEN 8
                       WHEN 'S' THEN 32 WHEN 'M' THEN 64 WHEN 'P' THEN 128 END) AS mx
  FROM elig e
  WHERE NOT EXISTS (SELECT 1 FROM ua WHERE ua.user_id = e.user_id AND ua.ex = e.ex)
  GROUP BY e.user_id
),
gap AS (
  SELECT s.user_id, s.campus_id,
      (CASE WHEN a.user_id IS NULL THEN 1 ELSE 0 END) + COALESCE(m.mx, 0) AS x
  FROM stu s
  LEFT JOIN anyatt a ON a.user_id = s.user_id
  LEFT JOIN miss   m ON m.user_id = s.user_id
),
leads AS (
  SELECT DISTINCT cm.profile_id AS lid, p.name AS lname, cm.campus_id AS cid
  FROM noon2_core.campus_managers cm
  JOIN noon2_core.profile p ON p.id = cm.profile_id AND p.is_deleted = 0 AND p.user_type = 'SCHOOL_LEAD'
  WHERE cm.role = 'PRINCIPAL' AND cm.campus_id IN (SELECT campus_id FROM mgr)
),
-- a cohort whose facilitator profile is deleted: assigned on paper, owned by nobody.
-- facilitator_id IS NULL finds none of these; only the profile join does.
-- Two ways a class ends up with nobody real in charge, reported side by side:
--   D = the facilitator's profile is deleted
--   I = the facilitator is a Noon-internal placeholder account (see `nooner`)
orphan AS (
  SELECT c.campus_id, c.cohort_name, c.facilitator_id, MAX(c.facilitator_name) AS fname,
         COUNT(DISTINCT c.user_id) AS students, 'D' AS why
  FROM d c JOIN noon2_core.profile p ON p.id = c.facilitator_id AND p.is_deleted = 1
  GROUP BY c.campus_id, c.cohort_name, c.facilitator_id
  UNION ALL
  SELECT c.campus_id, c.cohort_name, c.facilitator_id, MAX(c.facilitator_name),
         COUNT(DISTINCT c.user_id), 'I'
  FROM d c
  WHERE c.facilitator_id IN (SELECT user_id FROM nooner)
  GROUP BY c.campus_id, c.cohort_name, c.facilitator_id
),
internal_fac AS (
  SELECT c.facilitator_id AS fid, MAX(c.facilitator_name) AS fname,
         COUNT(DISTINCT c.cohort_name) AS cohorts,
         COUNT(DISTINCT c.campus_id)   AS campuses,
         COUNT(DISTINCT c.user_id)     AS students
  FROM d c WHERE c.facilitator_id IN (SELECT user_id FROM nooner)
  GROUP BY c.facilitator_id
)
SELECT
  (SELECT json_format(CAST(ARRAY_AGG(CAST(ROW(nm.user_name, g.campus_id, w.student_grade_name,
      w.cohort_name, w.facilitator_id, g.x) AS ROW(n VARCHAR, c BIGINT, g VARCHAR, k VARCHAR, f BIGINT, x INT))) AS JSON))
   FROM gap g JOIN nm ON nm.user_id = g.user_id JOIN who w ON w.user_id = g.user_id WHERE g.x > 0) AS students,
  (SELECT json_format(CAST(ARRAY_AGG(CAST(ROW(lid, lname, cid)
      AS ROW(lid BIGINT, name VARCHAR, cid BIGINT))) AS JSON)) FROM leads) AS leads,
  (SELECT json_format(CAST(ARRAY_AGG(CAST(ROW(campus_id, cohort_name, facilitator_id, fname, students, why)
      AS ROW(c BIGINT, k VARCHAR, f BIGINT, fn VARCHAR, n BIGINT, w VARCHAR))) AS JSON)) FROM orphan) AS orphans,
  (SELECT json_format(CAST(ARRAY_AGG(CAST(ROW(fid, fname, cohorts, campuses, students)
      AS ROW(fid BIGINT, fname VARCHAR, cohorts BIGINT, campuses BIGINT, students BIGINT))) AS JSON))
   FROM internal_fac) AS internal_facilitators
