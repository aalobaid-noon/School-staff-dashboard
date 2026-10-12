-- trust-survey free text, complete weeks only: one JSON row. Append after 00_common.sql.
-- The comment rides on the STAR_RATING rows of the weekly Trust survey (both questions),
-- so `choice` gives the rating that goes with the text.
, prim AS (
  SELECT user_id, campus_id, cohort_name, facilitator_id,
         ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY COUNT(*) DESC, cohort_name) AS rn
  FROM d GROUP BY user_id, campus_id, cohort_name, facilitator_id
),
who AS (SELECT user_id, campus_id, cohort_name, facilitator_id FROM prim WHERE rn = 1),
cm AS (
  SELECT v.user_id,
         CAST(FLOOR(DATE_DIFF('day', {{TERM}}, CAST(v.survey_datetime AS DATE))/7) AS INT)+1 AS wk,
         CASE WHEN v.survey_question_message LIKE '%الأنشطة%' THEN 'A' ELSE 'X' END AS q,
         v.choice, TRIM(v.comment) AS txt
  FROM noon2_datamart.f_user_survey v
  WHERE v.user_type = 'STUDENT' AND v.survey_type = 'Trust' AND v.responded = 1
    AND v.comment IS NOT NULL AND TRIM(v.comment) <> ''
    AND v.survey_datetime >= {{START}} AND v.survey_datetime < {{END_WK}}
)
SELECT json_format(CAST(ARRAY_AGG(CAST(ROW(w.campus_id, w.facilitator_id, w.cohort_name,
    cm.wk, cm.q, cm.choice, cm.txt)
  AS ROW(c BIGINT, f BIGINT, k VARCHAR, w INT, q VARCHAR, r VARCHAR, t VARCHAR))) AS JSON)) AS comments
FROM cm JOIN who w ON w.user_id = cm.user_id
