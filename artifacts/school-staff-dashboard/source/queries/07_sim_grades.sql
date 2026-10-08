-- Diagnostics + simulators by the grade of the students who sat them. NOT scoped to the managers'
-- schools: all Noon students (that is what the section is for). Standalone — do NOT prepend 00_common.sql.
-- "Sat it" = at least one row in f_user_assessment (diagnostics and simulators are not scheduled through
-- noon2_core.assessment_schedule, so attempts are the only truth). Grade = the student's CURRENT grade (d_user),
-- not the grade at the time of the attempt, which is why "Graduated" shows up.
-- Programme from subject_id only (never subject_name); simulators are classified by assessment_type.
-- Never add the programmes together: one student can sit several. Cells under 5 students are dropped.
-- Periods: all = since 20250801 · y2526 = 20250801..20260731 · y2627 = from 20260801 (bump yearly).
-- One row, one JSON column `simgrades` (+ spill_pad so the result lands in a file).
WITH program_map AS (
  SELECT * FROM (VALUES
    (248,'القدرات'),(249,'القدرات'),(250,'القدرات'),
    (251,'التحصيلي'),(252,'التحصيلي'),(253,'التحصيلي'),(254,'التحصيلي'),
    (517,'نافس'),(518,'نافس'),(519,'نافس'),
    (661,'ESL'),(662,'ESL'),(663,'ESL'),
    (581,'المنهج الوطني'),(582,'المنهج الوطني'),(583,'المنهج الوطني'),(584,'المنهج الوطني'),(585,'المنهج الوطني'),
    (586,'المنهج الوطني'),(587,'المنهج الوطني'),(588,'المنهج الوطني'),(589,'المنهج الوطني'),
    (590,'المنهج الوطني'),(594,'المنهج الوطني'),(598,'المنهج الوطني'),
    (553,'الدولي'),(554,'الدولي'),(603,'الدولي'),(604,'الدولي'),(605,'الدولي'),(606,'الدولي'),
    (607,'الدولي'),(608,'الدولي'),(612,'الدولي'),(613,'الدولي'),(615,'الدولي'),(616,'الدولي')
  ) t(subject_id, program)
),
periods AS (SELECT * FROM (VALUES ('all',20250801,99999999),('y2526',20250801,20260731),('y2627',20260801,99999999)) t(p, lo, hi)),
att AS (
  SELECT DISTINCT a.user_id, a.practice_assessment_id, a.assessment_type, a.subject_id, p.p
  FROM noon2_datamart.f_user_assessment a
  JOIN periods p ON a.dt BETWEEN p.lo AND p.hi
  WHERE a.dt >= 20250801
    AND a.assessment_type IN ('DIAGNOSTIC','QUDRAT_SIMULATOR','TAHSILI_SIMULATOR')
),
r AS (
  SELECT
    CASE att.assessment_type WHEN 'QUDRAT_SIMULATOR' THEN 'القدرات' WHEN 'TAHSILI_SIMULATOR' THEN 'التحصيلي'
         ELSE COALESCE(pm.program, 'غير مصنف') END AS program,
    att.assessment_type AS ty, att.p AS p,
    COALESCE(u.student_grade_name, 'بدون صف') AS grade,
    COUNT(DISTINCT att.practice_assessment_id) AS assessments,
    COUNT(DISTINCT att.user_id) AS students
  FROM att
  JOIN noon2_datamart.d_user u ON att.user_id = u.user_id AND u.user_type = 'STUDENT' AND u.country_name <> 'Noon internal'
  LEFT JOIN program_map pm ON att.subject_id = pm.subject_id
  GROUP BY 1, 2, 3, 4
  HAVING COUNT(DISTINCT att.user_id) >= 5
)
SELECT
  (SELECT json_format(CAST(ARRAY_AGG(CAST(ROW(program, ty, p, grade, assessments, students)
     AS ROW(pr VARCHAR, ty VARCHAR, p VARCHAR, g VARCHAR, a BIGINT, n BIGINT))) AS JSON)) FROM r) AS simgrades,
  ARRAY_JOIN(REPEAT(ARRAY_JOIN(REPEAT('.', 10000), ''), 12), '') AS spill_pad
