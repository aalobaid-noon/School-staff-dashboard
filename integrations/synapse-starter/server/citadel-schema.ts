// =============================================================================
// Athena Metadata Registry — Single source of truth for Playground Athena access
// =============================================================================
// Generated from Notion Data Dictionary (Layer 2 & Layer 3)
// Source: https://www.notion.so/noonacademy/Layer-2-Fact-and-Dim-tables-fb4ed4d903be4e6baee7dd7ec63cd71d
// Source: https://www.notion.so/noonacademy/Layer-3-Business-Aggregation-Tables-c794c8972edf43b198ffa89e413bb982
// Last updated: 2026-07-22
// =============================================================================
// v2.22 (2026-07-22) — Registry-gap fill:
//   • noon2_core Lesson Builder model: lesson, lesson_version, lesson_session_link,
//     lesson_activity, lesson_activity_question, lesson_curriculum, lesson_segment,
//     lesson_session_materialization, lesson_session_materialization_mapping, lesson_share_link
//   • NEW database datamart_v: kyy_nn_session_details, nn_activity_details, nn_activity_quality
//   • noon2_replit: nn_assessment_details, nn_learning_gains, hk_f_course_session,
//     hk_f_user_session, hk_session_questions, session_transcriptions
// =============================================================================

export interface AthenaColumnMeta {
  name: string;
  type: string; // Athena SQL type e.g. "varchar", "bigint", "double", "timestamp"
  description: string; // From Notion — shown to Claude in system prompt
  enumValues?: string[]; // Distinct values for filtering — shown to Claude so it uses correct WHERE clauses
}

export type AthenaAccessLevel = 'all' | 'leader_and_above' | 'admin_only';

export interface AthenaTableMeta {
  key: string; // e.g. "f_user_session"
  database: string; // "noon2_datamart"
  table: string; // actual Athena table name
  description: string; // From Notion page
  grain: string; // Row-level granularity
  partition: string | null; // Partition column, if any
  refreshCadence: string; // e.g. "Every 12 hours"
  columns: AthenaColumnMeta[];
  accessLevel: AthenaAccessLevel;
  scopeColumn: string | null; // "user_id" for student tables; null for dimension tables
  scopeType: 'user_id' | 'campus_id' | null;
  exampleQueries?: string[]; // Vetted SQL patterns from team's Example Queries page
}

// ---------------------------------------------------------------------------
// LAYER 3 — Business Aggregation Tables
// ---------------------------------------------------------------------------

const f_user_session: AthenaTableMeta = {
  key: 'f_user_session',
  database: 'noon2_datamart',
  table: 'f_user_session',
  description:
    'A distinct list of each session that a user (profile) has attended. Summarises session + user information. ' +
    'Includes ALL profiles (students, teachers, presenters). ' +
    'If a session runs over 2 days (UTC), a user may have 2 rows (<0.02% of cases).',
  grain: 'User + Session (+ date in rare edge cases)',
  partition: 'dt',
  refreshCadence: 'Every 12 hours',
  accessLevel: 'all',
  scopeColumn: 'user_id',
  scopeType: 'user_id',
  columns: [
    { name: 'user_id', type: 'bigint', description: 'ID of the user profile' },
    { name: 'user_name', type: 'varchar', description: 'Name of the user' },
    {
      name: 'user_type',
      type: 'varchar',
      description: 'User type: TEACHER / STUDENT / PRESENTER etc.',
      enumValues: ['FACILITATOR', 'PRESENTER', 'STUDENT', 'TEACHER', 'TEACHING_ASSISTANT'],
    },
    { name: 'course_session_id', type: 'bigint', description: 'Unique ID of the course session' },
    { name: 'course_id', type: 'bigint', description: 'Course ID for the session' },
    {
      name: 'room_id',
      type: 'bigint',
      description: 'Room ID (should be 1:1 with session, except early July 2023)',
    },
    {
      name: 'teacher_id',
      type: 'bigint',
      description: 'Profile ID of the teacher who taught the session',
    },
    {
      name: 'is_course_session_teacher',
      type: 'int',
      description: 'Whether this user is the teacher of this session',
    },
    {
      name: 'course_session_class_type',
      type: 'varchar',
      description: 'Class type: LIVE_CLASS or LIVE_MASTERY',
      enumValues: ['LIVE_CLASS', 'LIVE_MASTERY'],
    },
    {
      name: 'room_time',
      type: 'decimal(38,2)',
      description: 'Total time user spent in the room in minutes',
    },
    {
      name: 'learning_time',
      type: 'decimal(38,2)',
      description: 'Time spent with teacher present in minutes',
    },
    {
      name: 'teaching_time',
      type: 'decimal(38,2)',
      description: 'Teaching time in minutes (for teachers)',
    },
    {
      name: 'session_time',
      type: 'decimal(38,2)',
      description: 'For live sessions = teaching_time; for live mastery = room_time',
    },
    {
      name: 'active_time',
      type: 'decimal(38,2)',
      description: 'Total active time for student in session (minutes). NULL for teacher.',
    },
    { name: 'lobby_time', type: 'decimal(38,2)', description: 'Time spent in lobby in minutes' },
    {
      name: 'lobby_before_time',
      type: 'decimal(38,2)',
      description: 'Lobby time before teacher joined',
    },
    {
      name: 'lobby_after_time',
      type: 'decimal(38,2)',
      description: 'Lobby time after teacher left',
    },
    {
      name: 'user_enter_time',
      type: 'timestamp',
      description: 'First time the user entered the session (UTC)',
    },
    {
      name: 'user_exit_time',
      type: 'timestamp',
      description: 'Last time the user exited the session (UTC)',
    },
    {
      name: 'teacher_start_datetime',
      type: 'timestamp',
      description: 'First time the teacher entered the session (UTC). NULL for live mastery.',
    },
    {
      name: 'teacher_end_datetime',
      type: 'timestamp',
      description: 'Last time the teacher exited the session (UTC)',
    },
    { name: 'room_open_time', type: 'timestamp', description: 'Time the room opened (UTC)' },
    { name: 'room_end_time', type: 'timestamp', description: 'Time the room closed (UTC)' },
    {
      name: 'total_messages',
      type: 'int',
      description: 'Total chat messages sent by the user. NULL for presenters.',
    },
    {
      name: 'total_hand_raise',
      type: 'int',
      description: 'Total hand raises. NULL for presenter/teacher.',
    },
    { name: 'total_unmutes', type: 'int', description: 'Total times the user unmuted' },
    { name: 'total_video_on', type: 'int', description: 'Total times the user turned video on' },
    {
      name: 'total_polls_seen',
      type: 'int',
      description: 'Total polls seen by student. NULL for non-students. Populated from 1 Apr 2024.',
    },
    {
      name: 'total_polls_responded',
      type: 'int',
      description: 'Total polls answered by student. NULL for non-students.',
    },
    { name: 'entered_room', type: 'int', description: 'Number of times the user entered the room' },
    {
      name: 'platforms',
      type: 'array<varchar>',
      description: 'Platforms used to access session e.g. [android]',
      enumValues: ['android', 'ios', 'web'],
    },
    {
      name: 'device_ids',
      type: 'array<varchar>',
      description: 'Device IDs used to access session',
    },
    { name: 'country_ids', type: 'array<bigint>', description: 'Country IDs linked to the course' },
    {
      name: 'country_names',
      type: 'array<varchar>',
      description: 'Country names linked to the course',
    },
    {
      name: 'room_ids',
      type: 'array<bigint>',
      description: 'Room IDs joined by this user in this session',
    },
    {
      name: 'total_rooms_joined',
      type: 'int',
      description: 'Total number of rooms the user joined in this session',
    },
    {
      name: 'total_breakouts_attended',
      type: 'int',
      description: 'Total breakout rooms attended by the user',
    },
    {
      name: 'total_breakouts_happened',
      type: 'int',
      description: 'Total breakout rooms that happened in this session',
    },
    {
      name: 'classroom_name',
      type: 'varchar',
      description: 'Name of the first physical classroom joined (from 16 May 2024)',
    },
    {
      name: 'classroom_description',
      type: 'varchar',
      description: 'Description of the first physical classroom joined',
    },
    {
      name: 'classroom_join_code',
      type: 'varchar',
      description: 'Join code for the physical classroom',
    },
    {
      name: 'user_sentiment',
      type: 'varchar',
      description:
        'Combined user sentiment: neutral / positive / negative. Based on reactions + chat + survey.',
      enumValues: ['negative', 'neutral', 'positive'],
    },
    {
      name: 'feature_active_duration',
      type: 'varchar',
      description: 'Active duration of feature usage in the session (stored as JSON string)',
    },
    {
      name: 'feature_active_duration_during_activity',
      type: 'varchar',
      description: 'Active duration of feature usage during activities (stored as JSON string)',
    },
    { name: 'dt', type: 'bigint', description: 'Partition column YYYYMMDD based on session date' },
  ],
  exampleQueries: [
    `-- Student time in live sessions
SELECT user_id, user_name, course_session_id, learning_time, room_time, active_time, lobby_time
FROM noon2_datamart.f_user_session
WHERE user_type = 'STUDENT' AND learning_time >= 0`,
    `-- Ufuq school students session activity
SELECT DISTINCT u.user_id, u.user_name, COUNT(DISTINCT s.course_session_id) as sessions_attended, SUM(s.learning_time) as total_learning_time_mins
FROM noon2_datamart.d_user u
INNER JOIN noon2_datamart.f_user_session s ON u.user_id = s.user_id
WHERE u.campus_id IN (68,69,70,71,72,73,74,75,76,77) AND u.user_type = 'STUDENT' AND s.learning_time > 0
GROUP BY 1,2,3,4`,
  ],
};

const f_user_playback: AthenaTableMeta = {
  key: 'f_user_playback',
  database: 'noon2_datamart',
  table: 'f_user_playback',
  description:
    'A distinct list of each playback that a user (profile) has watched. ' +
    'Summarises playback + user info. ALL profiles accessed via student app/web.',
  grain: 'Each playback watched (playback_session_id) + date in rare edge cases',
  partition: 'dt',
  refreshCadence: 'Every 12 hours',
  accessLevel: 'all',
  scopeColumn: 'user_id',
  scopeType: 'user_id',
  columns: [
    { name: 'user_id', type: 'bigint', description: 'ID of the user profile' },
    { name: 'user_name', type: 'varchar', description: 'Name of the user' },
    {
      name: 'user_type',
      type: 'varchar',
      description: 'User type: STUDENT / PRESENTER etc.',
      enumValues: ['PRESENTER', 'STUDENT'],
    },
    {
      name: 'playback_session_id',
      type: 'varchar',
      description: 'Unique ID of the specific playback attempt',
    },
    {
      name: 'course_session_id',
      type: 'bigint',
      description: 'Course session ID the playback is for',
    },
    { name: 'course_id', type: 'bigint', description: 'Course ID of the playback' },
    {
      name: 'teacher_id',
      type: 'bigint',
      description: 'Profile ID of the teacher who taught the session',
    },
    {
      name: 'learning_time',
      type: 'decimal(38,2)',
      description: 'Total time spent in playback in minutes',
    },
    {
      name: 'learning_time_raw',
      type: 'decimal(38,2)',
      description:
        'Raw difference between min and max systemtime in minutes (includes disconnect time)',
    },
    {
      name: 'max_position_duration',
      type: 'decimal(38,2)',
      description: 'Highest time position of the playback video reached by the user (minutes)',
    },
    {
      name: 'room_duration',
      type: 'decimal(38,2)',
      description: 'Duration of the original live room in minutes',
    },
    {
      name: 'activity_start_time',
      type: 'timestamp',
      description: 'When the user first entered the playback (UTC)',
    },
    {
      name: 'activity_end_time',
      type: 'timestamp',
      description: 'When the user exited the playback (UTC)',
    },
    {
      name: 'playback_source',
      type: 'varchar',
      description:
        'Where the user accessed the playback from. NOTE: contains dirty values — main clean ones listed.',
      enumValues: [
        'CourseDetail',
        'CourseDetail Download',
        'MyDay',
        'MySchedule',
        'Schedule',
        'SchoolSchedule',
        'share',
      ],
    },
    {
      name: 'device',
      type: 'struct<platform:varchar,device_id:varchar,app_version:varchar>',
      description: 'Device info: platform, device_id, app_version',
    },
    { name: 'country_ids', type: 'array<bigint>', description: 'Country IDs linked to the course' },
    {
      name: 'country_names',
      type: 'array<varchar>',
      description: 'Country names linked to the course',
    },
    { name: 'dt', type: 'bigint', description: 'Partition column YYYYMMDD' },
  ],
};

const f_student_activity: AthenaTableMeta = {
  key: 'f_student_activity',
  database: 'noon2_datamart',
  table: 'f_student_activity',
  description:
    'A distinct list of each activity that a student has attended. ' +
    'Covers: Course Sessions, Playbacks, On-Demand Mastery, Assessments. ' +
    'Students only (not teachers). MCQ/Polls excluded to avoid double-counting time.',
  grain: 'User + activity_id + activity date',
  partition: 'dt',
  refreshCadence: 'Every 12 hours',
  accessLevel: 'all',
  scopeColumn: 'user_id',
  scopeType: 'user_id',
  columns: [
    { name: 'user_id', type: 'bigint', description: 'ID of the student profile' },
    {
      name: 'activity_id',
      type: 'varchar',
      description:
        'ID of the activity (course_session_id / playback_session_id / practice_id depending on type)',
    },
    {
      name: 'activity_type',
      type: 'varchar',
      description: 'Type of activity: Course Session, Playback, On Demand Mastery, Assessment',
      enumValues: ['Assessment', 'Course Session', 'Playback', 'on-demand mastery'],
    },
    {
      name: 'course_id',
      type: 'bigint',
      description: 'Course ID. NULL for assessments and custom practice.',
    },
    {
      name: 'teacher_id',
      type: 'bigint',
      description: 'Teacher profile ID (session/playback teacher, or course teacher for ODM)',
    },
    {
      name: 'activity_datetime',
      type: 'timestamp',
      description: 'First datetime the student started the activity (UTC)',
    },
    {
      name: 'activity_start_time',
      type: 'timestamp',
      description: 'First time student started the activity (UTC)',
    },
    {
      name: 'activity_end_time',
      type: 'timestamp',
      description: 'First time student left the activity (UTC)',
    },
    {
      name: 'time_spent_learning',
      type: 'decimal(38,2)',
      description:
        'Total learning time in minutes (study_time / learning_time / poll_duration / assessment_time)',
    },
    {
      name: 'time_spent_all',
      type: 'decimal(38,2)',
      description:
        'Total time spent in the activity in minutes (room_time / learning_time / duration)',
    },
    {
      name: 'country_ids',
      type: 'array<bigint>',
      description: 'Country IDs (from course or student if no course)',
    },
    { name: 'country_names', type: 'array<varchar>', description: 'Country names' },
    { name: 'dt', type: 'bigint', description: 'Partition column YYYYMMDD' },
  ],
  exampleQueries: [
    `-- Active students (did any activity on the platform)
SELECT DISTINCT user_id FROM noon2_datamart.f_student_activity`,
    `-- Use time_spent_learning for activation metrics, not time_spent_all`,
  ],
};

// ---------------------------------------------------------------------------
// LAYER 2 — Fact Tables
// ---------------------------------------------------------------------------

const f_classroom_events: AthenaTableMeta = {
  key: 'f_classroom_events',
  database: 'noon2_datamart',
  table: 'f_classroom_events',
  description:
    "All backend events related to a user's action in a classroom. " +
    'Each row is one event fired. Granular event-level data.',
  grain: 'Each event fired',
  partition: 'dt',
  refreshCadence: 'Every 12 hours',
  accessLevel: 'all',
  scopeColumn: null,
  scopeType: null,
  columns: [
    { name: 'event_id', type: 'varchar', description: 'Unique event ID' },
    {
      name: 'event_type',
      type: 'varchar',
      description: 'Type of event fired.',
      enumValues: [
        'ACTIVITY_CHANGE_SUBSLIDE',
        'ACTIVITY_COMPLETE',
        'ACTIVITY_FINISH',
        'ACTIVITY_NEXT_SUB_SLIDE',
        'ACTIVITY_PREV_SUB_SLIDE',
        'ACTIVITY_START',
        'BREAKOUT_END',
        'BREAKOUT_REVEAL_ANSWER',
        'BREAKOUT_SPOTLIGHT_STATS',
        'BREAKOUT_SPOTLIGHT_VIEW_END',
        'BREAKOUT_SPOTLIGHT_VIEW_START',
        'BREAKOUT_START',
        'BREAKOUT_START_DISCUSSION',
        'BREAKOUT_SUBMIT_CHOICE',
        'BRING_TEAM_ON_STAGE',
        'CAPTIONS_OFF',
        'CAPTIONS_ON',
        'CATEGORY_CHEER',
        'CHANGE_SLIDE',
        'CHANGE_SUBSLIDE',
        'CHAT_LOCK_OFF',
        'CHAT_LOCK_ON',
        'CONTENT_MODE_ON',
        'END_DISCUSSION',
        'END_SECTION',
        'HAND_LOWER',
        'HAND_RAISE',
        'HAND_RAISE_ACCEPTED',
        'HIDE_OPEN_TEXT_CATEGORY_EXAMPLES',
        'INVITE_AS_SPEAKER',
        'INVITE_AS_SPEAKER_ACCEPT',
        'INVITE_AS_SPEAKER_CANCEL',
        'INVITE_AS_SPEAKER_DECLINE',
        'INVITE_AS_SPEAKER_EXPIRE',
        'INVITE_AS_SPEAKER_TEAM_DUEL',
        'INVITE_AS_SPEAKER_V2',
        'LOWER_ALL_HANDS',
        'MCQ_SELECT',
        'MCQ_SUBMIT',
        'MCQ_VOTE',
        'MESSAGE',
        'MUTE',
        'OPEN_TEXT_CATEGORY_COLLAPSE',
        'OPEN_TEXT_CATEGORY_EXPAND',
        'OPEN_TEXT_CATEGORY_RESPONSE_MOVE',
        'PARTICIPANT_MUTE',
        'PARTICIPANT_UNMUTE',
        'POLL_FINISH',
        'POLL_REVEAL_ANSWER',
        'POLL_START',
        'REACTION',
        'REPORT_USER',
        'ROOM_DISCONNECT',
        'ROOM_JOIN',
        'SPEAKER_REMOVE',
        'SPEAKER_REMOVE_V2',
        'STAGE_MODE_ON',
        'START_CLASS',
        'START_DISCUSSION',
        'STUDENT_CHEER',
        'SURVEY_END',
        'SURVEY_START',
        'TEACHER_BLOCK_USER',
        'TEACHER_UNBLOCK_USER',
        'TEAM_CHEER',
        'TEAM_CREATE',
        'TEAM_FORMATION_END',
        'TEAM_JOIN',
        'TEAM_LEAVE',
        'UNMUTE',
        'USER_BLOCKED_DUE_TO_PROFANITY',
        'VIDEO_OFF',
        'VIDEO_ON',
        'VIEW_OPEN_TEXT_CATEGORY_EXAMPLES',
      ],
    },
    {
      name: 'actor_user_id',
      type: 'bigint',
      description: 'Profile ID of the user who triggered the event. NULL if actor is not a user.',
    },
    {
      name: 'actedupon_user_id',
      type: 'bigint',
      description:
        'Profile ID of the user the action was performed on (e.g. muted user). NULL if not applicable.',
    },
    { name: 'actedupon_room_id', type: 'bigint', description: 'Room ID the event occurred in.' },
    {
      name: 'classroom_code_id',
      type: 'bigint',
      description: 'Physical classroom code ID if event was from a classroom join.',
    },
    {
      name: 'acted_upon',
      type: 'array<struct<type:varchar,value:varchar>>',
      description:
        'Raw actedupon array from source — contains type/value pairs (USER, ROOM, CLASSROOM_CODE_ID, etc.)',
    },
    {
      name: 'event_timestamp',
      type: 'bigint',
      description: 'Unix timestamp of the event in milliseconds (UTC)',
    },
    {
      name: 'event_datetime',
      type: 'timestamp',
      description: 'Timestamp of the event (UTC), cast from event_timestamp',
    },
    { name: 'device_id', type: 'varchar', description: 'Device ID of the actor' },
    {
      name: 'platform',
      type: 'varchar',
      description: 'Platform: android / ios / web',
      enumValues: ['android', 'ios', 'web'],
    },
    { name: 'useragent', type: 'varchar', description: "User agent string of the actor's device" },
    {
      name: 'custommetadata',
      type: 'varchar',
      description:
        "JSON string with event-specific metadata. Use get_json_object() to extract fields (e.g. slideid, reactionemotion, reactionsource). Spotlight fields: segmentid (breakout segment id, on STATS events), sourcesegmentid (breakout segment id, on VIEW events — NOT the spotlight segment id), teacherinterventionneeded ('true'/'false', on STATS — filter to 'true' for real spotlights), spotlightmcqslidecount (number of MCQ slides in the spotlight, on STATS — fires multiple times per segment, use MAX). CAUTION: event_datetime is NULL on ALL BREAKOUT_SPOTLIGHT_STATS events; event_type IN ('BREAKOUT_SPOTLIGHT_VIEW_START','BREAKOUT_SPOTLIGHT_VIEW_END') have valid event_datetime. For MCQ_SUBMIT events: keys include activityid, mcqid, correctness (CORRECT/INCORRECT/UNKNOWN — uppercase strings), activitymode (SOLO/TEAM), freeflowing ('true'/'false' as strings).",
    },
    { name: 'dt', type: 'bigint', description: 'Partition column YYYYMMDD' },
  ],
};

const f_client_student_events: AthenaTableMeta = {
  key: 'f_client_student_events',
  database: 'noon2_datamart',
  table: 'f_client_student_events',
  description:
    "All frontend client events related to a user's action on the student app/web. " +
    'Includes any users on the student app/web (including presenters). ' +
    'Only data from app version 1.1.555 onwards. ' +
    'Note: app_loaded and onboarding_sign_in_clicked can have cardinality 0 in the data column. ' +
    'If the data column contains values with commas, cast first: CAST(data AS json).',
  grain: 'Each event fired',
  partition: 'dt',
  refreshCadence: 'Every 12 hours',
  accessLevel: 'all',
  scopeColumn: 'user_id',
  scopeType: 'user_id',
  columns: [
    {
      name: 'id',
      type: 'varchar',
      description: 'Unique event ID (deduplicated on id, keeping latest systemtime)',
    },
    {
      name: 'event_name',
      type: 'varchar',
      description: 'Name of the client event',
      enumValues: [
        'app_loaded',
        'bundle_join_btn_clicked',
        'bundle_joined',
        'classroom_inactivity',
        'course_join_btn_clicked',
        'course_joined',
        'dashboard_viewed',
        'ettings_updated',
        'explanation_closed',
        'explanation_link_pressed',
        'explanation_open',
        'heatmap_redesign_tile_pressed',
        'heatmap_tile_pressed',
        'onboarding_community_selected',
        'onboarding_country_selected',
        'onboarding_generate_otp_clicked',
        'onboarding_get_started_clicked',
        'onboarding_retry_otp_clicked',
        'onboarding_sign_in_clicked',
        'onboarding_verify_otp_clicked',
        'payment_failed',
        'playback_enter',
        'playback_exit',
        'playback_heartbeat',
        'playback_inactivity',
        'playback_pause',
        'playback_resume',
        'playback_seek_backward',
        'playback_seek_forward',
        'screen_viewed',
        'start_practice_from_heatmap_redesign_tile_pressed',
        'start_practice_from_heatmap_tile_pressed',
        'subscription_btn_clicked',
      ],
    },
    {
      name: 'data',
      type: 'array<struct<type:varchar,value:varchar>>',
      description:
        'Event properties array. Note: cardinality 0 for app_loaded and onboarding_sign_in_clicked.',
    },
    {
      name: 'user_id',
      type: 'bigint',
      description: 'Profile ID of the user (cast from user.userid)',
    },
    { name: 'user_tenant', type: 'varchar', description: 'User tenant (from user.tenant)' },
    { name: 'user_locale', type: 'varchar', description: 'User locale (from user.locale)' },
    {
      name: 'device_platform',
      type: 'varchar',
      description: 'Platform: android / ios / web (from device.platform)',
    },
    {
      name: 'device',
      type: 'struct<browserName:varchar,browserVersion:varchar,osName:varchar,osVersion:varchar,Platform:varchar,isDesktop:boolean,deviceId:varchar>',
      description:
        'Full device struct. Access sub-fields: device.deviceId, device.Platform, device.browserName, device.isDesktop',
    },
    { name: 'country_code', type: 'varchar', description: 'Country code from countrycode field' },
    {
      name: 'ipcountry',
      type: 'varchar',
      description:
        'IP-derived country info (may be string or struct depending on cache; parse carefully)',
    },
    {
      name: 'meta',
      type: 'struct<version:varchar,ts:bigint>',
      description: 'App metadata. meta.version = app version string; meta.ts = server timestamp',
    },
    {
      name: 'systemtime',
      type: 'bigint',
      description: 'System time in milliseconds (client-side)',
    },
    {
      name: 'event_datetime',
      type: 'timestamp',
      description: 'Timestamp cast from systemtime (UTC)',
    },
    { name: 'dt', type: 'bigint', description: 'Partition column YYYYMMDD' },
  ],
  exampleQueries: [
    `-- Method 1: Unnest data column (1 row per property)
SELECT id, user_id, event_name, dat.type, dat.value, event_datetime
FROM noon2_datamart.f_client_student_events a
CROSS JOIN UNNEST(data) AS t(dat)
WHERE dt = 20240415`,
    `-- Method 2: Extract specific field (1 row per event)
SELECT id, user_id, event_name, data[1].type AS type, data[1].value AS type_value, device.deviceid, meta.version AS app_version
FROM noon2_datamart.f_client_student_events a
WHERE dt = 20240415 AND event_name NOT IN ('app_loaded','onboarding_sign_in_clicked')`,
    `-- Pages viewed
SELECT id, user_id, event_name, dat.type, dat.value, device_platform, event_datetime
FROM noon2_datamart.f_client_student_events a
CROSS JOIN UNNEST(a.data) AS t(dat)
WHERE a.dt = 20240419 AND event_name = 'screen_viewed'`,
  ],
};

const f_user_poll: AthenaTableMeta = {
  key: 'f_user_poll',
  database: 'noon2_datamart',
  table: 'f_user_poll',
  description:
    'All polls/MCQs/on-demand mastery questions that were created, seen, or answered. ' +
    'Grain: poll_id + poll_source + poll_type + user_id. ' +
    'If poll was never attempted, attempt_id is null. ' +
    'To filter: poll_seen=1 for seen polls, poll_answered=1 for answered polls.',
  grain: 'Each poll + user (attempt_id)',
  partition: 'dt',
  refreshCadence: 'Every 12 hours',
  accessLevel: 'all',
  scopeColumn: 'user_id',
  scopeType: 'user_id',
  columns: [
    {
      name: 'attempt_id',
      type: 'varchar',
      description: 'Unique ID of the attempt. NULL if poll not yet attempted or not seen.',
    },
    { name: 'poll_id', type: 'int', description: 'Unique ID of the poll/mcq/ODM question.' },
    {
      name: 'user_id',
      type: 'int',
      description: 'Profile ID of the user who answered. NULL if never answered.',
    },
    { name: 'question_id', type: 'int', description: 'ID of the question in the poll/mcq/ODM' },
    {
      name: 'course_session_id',
      type: 'int',
      description: 'Session the poll was in. NULL for ODM poll_type_2=on-demand mastery.',
    },
    { name: 'course_id', type: 'bigint', description: 'Course ID' },
    {
      name: 'poll_type',
      type: 'varchar',
      description: 'Type: poll, on-demand mastery, mcq',
      enumValues: ['mcq', 'on-demand mastery', 'poll'],
    },
    {
      name: 'poll_type_2',
      type: 'varchar',
      description:
        'Sub-type: poll, on-demand mastery, mcq, CUSTOM, QUESTION, MARATHON, TEAM_EXERCISE, practice, custom practice, smart practice. EXIT_TICKET data starts from 2025-07-10 — no rows before that.',
      enumValues: [
        'ANNOTATION_RESPONSE',
        'BETTER_CALL_SAUL',
        'CUSTOM',
        'EXIT_TICKET',
        'MARATHON',
        'OPEN_RESPONSE',
        'QUESTION',
        'SECTION_CHECK',
        'SQUID_GAME',
        'TEAM_DUEL',
        'TEAM_EXERCISE',
        'custom practice',
        'daily challenge',
        'mcq',
        'on-demand mastery',
        'poll',
        'practice',
        'revision',
        'smart practice',
      ],
    },
    {
      name: 'poll_source',
      type: 'varchar',
      description: 'Where activity was: course session / playback / course',
      enumValues: ['course', 'course session', 'non-course', 'other', 'playback'],
    },
    { name: 'poll_seen', type: 'int', description: '1 if the user saw the poll, 0 otherwise' },
    { name: 'poll_answered', type: 'int', description: '1 if the user answered, 0 otherwise' },
    {
      name: 'selected_choice_id',
      type: 'int',
      description: "ID of the choice selected. -1 = present but didn't answer.",
    },
    {
      name: 'correct_choice_id',
      type: 'int',
      description: 'ID of the correct answer. NULL if no correct answer (survey-style).',
    },
    {
      name: 'is_correct_answer',
      type: 'int',
      description: '1 if correct, 0 if wrong, NULL if no correct answer',
    },
    { name: 'question_text', type: 'varchar', description: 'The question text' },
    { name: 'question_type', type: 'varchar', description: 'Type of question' },
    {
      name: 'question_format',
      type: 'varchar',
      description: 'Format of the question',
      enumValues: ['image and text', 'image only', 'no question', 'text only'],
    },
    {
      name: 'choice_type',
      type: 'varchar',
      description: 'OPEN_TEXT or MCQ',
      enumValues: ['ANNOTATION', 'MCQ', 'OPEN_TEXT'],
    },
    {
      name: 'creator_id',
      type: 'int',
      description: 'Profile ID of who created the poll (teacher for poll/mcq, student for ODM)',
    },
    { name: 'poll_duration', type: 'int', description: 'Duration of the poll in seconds' },
    { name: 'poll_start_time', type: 'timestamp', description: 'Start time of the poll (UTC)' },
    { name: 'poll_end_time', type: 'timestamp', description: 'End time of the poll (UTC)' },
    { name: 'poll_created_at', type: 'timestamp', description: 'When the poll was created (UTC)' },
    {
      name: 'poll_updated_at',
      type: 'timestamp',
      description: 'When the poll was last updated (UTC)',
    },
    {
      name: 'choice_submitted_at',
      type: 'timestamp',
      description: 'When the student submitted their answer (UTC)',
    },
    {
      name: 'show_correct_answer',
      type: 'int',
      description: "Whether 'show correct answer' was enabled (1=yes)",
    },
    { name: 'is_poll_deleted', type: 'int', description: 'Whether the poll is deleted' },
    {
      name: 'is_course_session_deleted',
      type: 'int',
      description: 'Whether the session is deleted',
    },
    { name: 'on_demand_session_id', type: 'varchar', description: 'On-demand mastery session ID' },
    {
      name: 'evaluation_id',
      type: 'varchar',
      description: 'Evaluation ID (only for ODM poll_type_2=revision)',
    },
    { name: 'classroom_activity_id', type: 'bigint', description: 'Classroom activity ID' },
    {
      name: 'question_image_flag',
      type: 'int',
      description: '1 if the question has an image URL, 0 otherwise',
    },
    {
      name: 'total_choices_selected',
      type: 'int',
      description: 'Total choices selected by the user',
    },
    {
      name: 'submitted_choice_text',
      type: 'varchar',
      description: 'Text of the submitted choice (for OPEN_TEXT)',
    },
    {
      name: 'is_heatmap',
      type: 'int',
      description:
        "Indicates if the practice was started from a heatmap (ODM only). NULL for polls and MCQs. it's values 0 or 1",
    },
    {
      name: 'segment_id',
      type: 'varchar',
      description:
        'Segment ID if the poll occurred within a breakout or live mastery segment. NULL for main session polls.',
    },
    {
      name: 'segment_type',
      type: 'varchar',
      description: 'Segment type the poll occurred in',
      enumValues: ['BREAKOUT', 'LIVE_MASTERY', 'MAIN'],
    },
    { name: 'rn', type: 'int', description: 'Row number for deduplication' },
    { name: 'dt', type: 'bigint', description: 'Partition column YYYYMMDD' },
  ],
  exampleQueries: [
    `-- Poll/MCQ performance by session
SELECT p.course_session_id, p.poll_id, p.question_id, p.poll_type, p.poll_type_2,
  COUNT(DISTINCT p.user_id) AS total_students,
  SUM(CASE WHEN p.poll_seen=1 THEN 1 ELSE 0 END) AS students_seen,
  SUM(CASE WHEN p.poll_answered=1 THEN 1 ELSE 0 END) AS students_answered,
  SUM(CASE WHEN p.is_correct_answer=1 THEN 1 ELSE 0 END) AS correct_answers,
  ROUND(100.0 * SUM(CASE WHEN p.is_correct_answer=1 THEN 1 ELSE 0 END) / NULLIF(SUM(CASE WHEN p.poll_answered=1 THEN 1 ELSE 0 END),0), 2) AS accuracy_pct
FROM noon2_datamart.f_user_poll p
WHERE p.poll_source = 'course session' AND p.course_session_id = 68059
GROUP BY 1,2,3,4,5`,
    `-- Student-level poll performance in a session
SELECT p.user_id, u.user_name, p.course_session_id,
  COUNT(DISTINCT p.poll_id) AS total_polls,
  SUM(CASE WHEN p.poll_answered=1 THEN 1 ELSE 0 END) AS polls_answered,
  SUM(CASE WHEN p.is_correct_answer=1 THEN 1 ELSE 0 END) AS correct_answers,
  ROUND(100.0 * SUM(CASE WHEN p.is_correct_answer=1 THEN 1 ELSE 0 END) / NULLIF(SUM(CASE WHEN p.poll_answered=1 THEN 1 ELSE 0 END),0), 2) AS accuracy_pct
FROM noon2_datamart.f_user_poll p
INNER JOIN noon2_datamart.d_user u ON p.user_id = u.user_id
WHERE p.poll_source = 'course session' AND p.course_session_id = 68059
GROUP BY 1,2,3`,
    `-- On-Demand Mastery performance
SELECT p.user_id, u.user_name, p.evaluation_id, p.on_demand_session_id, p.course_id,
  COUNT(DISTINCT p.question_id) AS total_questions,
  SUM(CASE WHEN p.is_correct_answer=1 THEN 1 ELSE 0 END) AS correct,
  ROUND(100.0 * SUM(CASE WHEN p.is_correct_answer=1 THEN 1 ELSE 0 END) / NULLIF(SUM(CASE WHEN p.poll_answered=1 THEN 1 ELSE 0 END),0), 2) AS accuracy_pct
FROM noon2_datamart.f_user_poll p
INNER JOIN noon2_datamart.d_user u ON p.user_id = u.user_id
WHERE p.poll_type = 'on-demand mastery'
GROUP BY 1,2,3,4,5`,
  ],
};

const f_user_survey: AthenaTableMeta = {
  key: 'f_user_survey',
  database: 'noon2_datamart',
  table: 'f_user_survey',
  description:
    'All surveys that were presented and answered (or not) by students and teachers. ' +
    "Each row is one user's answer record for a survey question.",
  grain: 'Each survey answer record (survey_id + user_id + survey_question_id)',
  partition: null,
  refreshCadence: 'Every 12 hours',
  accessLevel: 'all',
  scopeColumn: 'user_id',
  scopeType: 'user_id',
  columns: [
    {
      name: 'survey_template_id',
      type: 'bigint',
      description: 'Survey template ID (PK of the template).',
    },
    { name: 'survey_id', type: 'bigint', description: 'Unique survey instance ID' },
    { name: 'title', type: 'varchar', description: 'Title of the survey template' },
    { name: 'survey_type', type: 'varchar', description: 'Type of the survey template' },
    { name: 'description', type: 'varchar', description: 'Description of the survey template' },
    {
      name: 'survey_question_id',
      type: 'bigint',
      description: 'ID of the specific survey question',
    },
    {
      name: 'survey_question_message',
      type: 'varchar',
      description: 'The question text shown to the user',
    },
    { name: 'question_type', type: 'varchar', description: 'Type of question (e.g. choice, open)' },
    {
      name: 'is_survey_question_active',
      type: 'int',
      description: 'Whether the survey question is currently active',
    },
    {
      name: 'question_key',
      type: 'varchar',
      description: 'Key identifier for the question within the template',
    },
    {
      name: 'course_session_id',
      type: 'bigint',
      description: 'Course session ID the survey was shown in',
    },
    { name: 'course_id', type: 'bigint', description: 'Course ID of the session' },
    {
      name: 'physical_room_id',
      type: 'bigint',
      description: 'Physical room ID (for room readiness surveys)',
    },
    { name: 'user_id', type: 'bigint', description: 'Profile ID of the user (student or teacher)' },
    {
      name: 'user_type',
      type: 'varchar',
      description: 'User type: STUDENT / TEACHER etc.',
      enumValues: ['FACILITATOR', 'PRESENTER', 'STUDENT', 'TEACHER', 'TEACHING_ASSISTANT'],
    },
    {
      name: 'comment',
      type: 'varchar',
      description: 'Open-text comment left by the user (if any)',
    },
    {
      name: 'choice',
      type: 'varchar',
      description: 'The choice value selected by the user (coalesced from choice text or title)',
      enumValues: [
        'APP_SLOW',
        'BAD',
        'CLASS_NOT_AUDIBLE',
        'CONFUSED',
        'EXCELLENT',
        'GOOD',
        'INTERNET_TROUBLE',
        'LOVED',
        'OK',
        'SAD',
        'STRONGER',
        'TEACHER_NOT_AUDIBLE',
        'TEACHER_VOICE_NOT_CLEAR',
        'VERY_BAD',
      ],
    },
    {
      name: 'responded',
      type: 'int',
      description: '1 if the user submitted a choice or comment, 0 otherwise',
    },
    {
      name: 'satisfaction_score',
      type: 'int',
      description:
        'Numeric score for survey_template_id=1 choices: EXCELLENT=5, GOOD=4, OK=3, BAD=2, VERY_BAD=1. NULL for other templates.',
    },
    {
      name: 'survey_datetime',
      type: 'timestamp',
      description: "When the user's survey answer was created (UTC)",
    },
  ],
  exampleQueries: [
    `-- End-of-session satisfaction reactions (survey_template_id = 5)
SELECT us.course_session_id, us.choice AS reaction, COUNT(DISTINCT us.user_id) AS students_count
FROM noon2_datamart.f_user_survey us
WHERE us.survey_template_id = 5 AND us.choice IS NOT NULL AND us.choice != ''
GROUP BY 1,2 ORDER BY students_count DESC`,
    `-- Survey results with session context
SELECT us.course_id, us.course_session_id, us.user_id, us.choice, us.satisfaction_score,
  s.learning_time
FROM noon2_datamart.f_user_survey us
INNER JOIN noon2_datamart.f_user_session s ON us.course_session_id = s.course_session_id AND us.user_id = s.user_id
INNER JOIN noon2_datamart.d_user u ON s.user_id = u.user_id AND u.country_name != 'Noon internal'`,
  ],
};

const f_course_session: AthenaTableMeta = {
  key: 'f_course_session',
  database: 'noon2_datamart',
  table: 'f_course_session',
  description:
    'All course sessions that were ever created. ' +
    'Contains session-level metadata: status, times, teacher info, temperature, segments, breakouts.',
  grain: 'Each course session',
  partition: null,
  refreshCadence: 'Every 12 hours',
  accessLevel: 'all',
  scopeColumn: null,
  scopeType: null,
  columns: [
    { name: 'course_session_id', type: 'int', description: 'Unique ID for the course session' },
    { name: 'course_id', type: 'bigint', description: 'Course ID' },
    { name: 'course_section_id', type: 'int', description: 'Section ID the session belongs to' },
    { name: 'course_session_name', type: 'varchar', description: 'Name of the session' },
    {
      name: 'course_session_status',
      type: 'varchar',
      description: 'Status: ended / planned / scheduled / room_open / started / cancelled',
      enumValues: ['ended', 'live', 'planned', 'scheduled'],
    },
    {
      name: 'course_session_type',
      type: 'varchar',
      description: 'Session type: online or hybrid',
      enumValues: ['HYBRID', 'OFFLINE', 'ONLINE'],
    },
    {
      name: 'course_session_class_type',
      type: 'varchar',
      description: 'Class type: LIVE_CLASS or LIVE_MASTERY',
      enumValues: ['LIVE_CLASS', 'LIVE_MASTERY'],
    },
    {
      name: 'course_session_teacher_id',
      type: 'bigint',
      description: 'Profile ID of the teacher in the session (longest presence).',
    },
    { name: 'course_teacher_id', type: 'bigint', description: 'Profile ID of the course teacher' },
    {
      name: 'is_course_session_paid',
      type: 'int',
      description: 'Whether the session is paid (1) or free (0)',
    },
    {
      name: 'is_course_session_deleted',
      type: 'int',
      description: 'Whether the session is deleted',
    },
    { name: 'is_course_deleted', type: 'int', description: 'Whether the course is deleted' },
    {
      name: 'course_session_scheduled_start_time',
      type: 'timestamp',
      description: 'Scheduled start time (UTC)',
    },
    {
      name: 'course_session_scheduled_end_time',
      type: 'timestamp',
      description: 'Scheduled end time (UTC)',
    },
    { name: 'room_open_time', type: 'timestamp', description: 'Time the room opened (UTC)' },
    { name: 'room_end_time', type: 'timestamp', description: 'Time the room closed (UTC)' },
    {
      name: 'teacher_start_time',
      type: 'timestamp',
      description: 'First time the teacher entered the room (UTC)',
    },
    {
      name: 'teacher_end_time',
      type: 'timestamp',
      description: 'Last time the teacher left the room (UTC)',
    },
    { name: 'teaching_time', type: 'decimal(32,2)', description: 'Total teaching time in minutes' },
    { name: 'session_time', type: 'decimal(38,2)', description: 'Session duration in minutes' },
    { name: 'room_ids', type: 'array<bigint>', description: 'Room IDs for the session' },
    { name: 'main_room_id', type: 'bigint', description: 'Main room ID for the session' },
    {
      name: 'total_segments',
      type: 'bigint',
      description: 'Total segments including main + breakouts',
    },
    { name: 'total_breakouts', type: 'bigint', description: 'Total breakout rooms planned' },
    {
      name: 'total_breakouts_happened',
      type: 'bigint',
      description: 'Total breakout rooms that actually happened',
    },
    { name: 'chapter_ids', type: 'array<int>', description: 'Chapter IDs tagged to the session' },
    { name: 'topic_ids', type: 'array<int>', description: 'Topic IDs tagged to the session' },
    {
      name: 'sub_topic_ids',
      type: 'array<int>',
      description: 'Sub-topic IDs tagged to the session',
    },
    {
      name: 'session_slide_id_list',
      type: 'array<varchar>',
      description: 'List of slide IDs used in the session',
    },
    {
      name: 'session_temperature',
      type: 'double',
      description:
        'Session sentiment score: ((positive - negative) / total) × 100. Range -100 to +100.',
    },
    {
      name: 'positive_users',
      type: 'bigint',
      description: 'Count of users classified as positive (>80% positive signals)',
    },
    {
      name: 'negative_users',
      type: 'bigint',
      description: 'Count of users classified as negative (<50% positive signals)',
    },
    {
      name: 'neutral_users',
      type: 'bigint',
      description: 'Count of users classified as neutral (50-80% positive signals)',
    },
    { name: 'created_at', type: 'timestamp', description: 'When the session record was created' },
    {
      name: 'avg_active_time_per_student',
      type: 'decimal(38,2)',
      description: 'Average active time per student in minutes',
    },
    {
      name: 'median_active_time_per_student',
      type: 'decimal(38,2)',
      description: 'Median active time per student in minutes',
    },
    {
      name: 'feature_avg_active_duration',
      type: 'varchar',
      description: 'Average feature active duration (stored as JSON string)',
    },
    {
      name: 'feature_median_active_duration',
      type: 'varchar',
      description: 'Median feature active duration (stored as JSON string)',
    },
    {
      name: 'activity_feature_avg_active_duration',
      type: 'varchar',
      description: 'Average activity-feature active duration (stored as JSON string)',
    },
    {
      name: 'activity_feature_median_active_duration',
      type: 'varchar',
      description: 'Median activity-feature active duration (stored as JSON string)',
    },
    {
      name: 'spotlight_count',
      type: 'bigint',
      description:
        'Number of breakout segments in the session where a Spotlight was triggered (teacherinterventionneeded=true). 0 if no spotlights. Available from 2026-01-25.',
    },
    {
      name: 'total_spotlight_duration_seconds',
      type: 'bigint',
      description:
        'Total Spotlight duration in seconds across all breakouts in the session. 0 if no spotlights. Stored as bigint.',
    },
  ],
  exampleQueries: [
    `-- Teacher time in sessions
SELECT a.course_session_id, a.course_session_teacher_id, b.user_name AS course_teacher_name,
  a.course_session_name, a.teaching_time, a.session_time
FROM noon2_datamart.f_course_session a
INNER JOIN noon2_datamart.d_user b ON a.course_session_teacher_id = b.user_id`,
  ],
};

const f_user_assessment: AthenaTableMeta = {
  key: 'f_user_assessment',
  database: 'noon2_datamart',
  table: 'f_user_assessment',
  description:
    'Every question in an assessment or homework for a user who attempted it. ' +
    'Student might have: answered, seen but not answered, or not seen some questions. ' +
    'Has NO subject_name column — join d_assessment on practice_assessment_id for subject_id.',
  grain: 'attempt_id (practice_id + answer_id)',
  partition: null,
  refreshCadence: 'Every 12 hours',
  accessLevel: 'all',
  scopeColumn: 'user_id',
  scopeType: 'user_id',
  columns: [
    {
      name: 'attempt_id',
      type: 'varchar',
      description: 'Unique attempt ID (practice_id + practice_user_session_id + question_id)',
    },
    {
      name: 'user_id',
      type: 'bigint',
      description: 'Profile ID of the student (from practice_user_session.profile_id)',
    },
    {
      name: 'assessment_type',
      type: 'varchar',
      description: 'Type of assessment: END_OF_CHAPTER, HOMEWORK, MOCK_MISSION, etc.',
      enumValues: [
        'DIAGNOSTIC',
        'END_OF_CHAPTER',
        'END_OF_SEMESTER',
        'HOMEWORK',
        'MOCK_MISSION',
        'ONLINE',
        'OTHER',
        'QUDRAT_SIMULATOR',
        'TAHSILI_SIMULATOR',
      ],
    },
    {
      name: 'assessment_start_time',
      type: 'timestamp',
      description: 'When the assessment session was started (UTC)',
    },
    { name: 'question_id', type: 'bigint', description: 'Question ID' },
    {
      name: 'question_order',
      type: 'int',
      description: 'Order of the question within the assessment',
    },
    { name: 'question_seen', type: 'int', description: '1 if the student saw the question' },
    { name: 'question_answered', type: 'int', description: '1 if the student submitted an answer' },
    {
      name: 'question_display_time',
      type: 'timestamp',
      description: 'When the question was first displayed to the student (UTC)',
    },
    {
      name: 'question_answer_time',
      type: 'timestamp',
      description: 'When the student submitted their answer (UTC)',
    },
    {
      name: 'duration',
      type: 'int',
      description:
        'Time spent on the question in seconds (outlier-capped; NULL if question never seen)',
    },
    {
      name: 'submitted_choice_id',
      type: 'bigint',
      description: 'ID of the choice the student submitted. NULL if not answered.',
    },
    {
      name: 'is_correct',
      type: 'int',
      description: '1 if correct, 0 if wrong, NULL if not answered',
    },
    {
      name: 'practice_assessment_id',
      type: 'varchar',
      description: 'Practice assessment ID (links to d_assessment.practice_assessment_id)',
    },
    {
      name: 'practice_id',
      type: 'varchar',
      description: 'Practice session ID (links to d_assessment.practice_id)',
    },
    { name: 'board_id', type: 'int', description: 'Board ID of the assessment' },
    {
      name: 'subject_id',
      type: 'int',
      description:
        'Subject ID of the assessment (FK → noon2_core.subject.id). USE THIS for subject classification, never subject_name. 100% populated for school courses. Qudrat IDs: 248=Quant, 249=Verbal, 250=Quant prep.',
    },
    {
      name: 'practice_assessment_session_start_date',
      type: 'timestamp',
      description: 'Start date of the assessment session window',
    },
    {
      name: 'practice_assessment_session_end_date',
      type: 'timestamp',
      description: 'End date of the assessment session window',
    },
    {
      name: 'practice_assessment_session_id',
      type: 'bigint',
      description: 'Assessment session ID',
    },
    {
      name: 'user_enter_code_time',
      type: 'timestamp',
      description: 'When the student entered the assessment PIN code (UTC)',
    },
    { name: 'dt', type: 'bigint', description: 'Partition column YYYYMMDD' },
  ],
  exampleQueries: [
    `-- Assessment completion rates
SELECT a.practice_id, d.practice_assessment_title, d.assessment_type,
  COUNT(DISTINCT a.user_id) AS total_students_attempted,
  SUM(CASE WHEN a.question_answered=1 THEN 1 ELSE 0 END) AS total_questions_answered,
  SUM(CASE WHEN a.is_correct=1 THEN 1 ELSE 0 END) AS total_correct_answers,
  ROUND(100.0 * SUM(CASE WHEN a.is_correct=1 THEN 1 ELSE 0 END) / NULLIF(SUM(CASE WHEN a.question_answered=1 THEN 1 ELSE 0 END),0), 2) AS overall_accuracy_pct
FROM noon2_datamart.f_user_assessment a
INNER JOIN noon2_datamart.d_assessment d ON a.practice_id = d.practice_id
GROUP BY 1,2,3`,
    `-- Question difficulty for an assessment
SELECT a.practice_id, a.question_id, a.question_order,
  COUNT(DISTINCT a.user_id) AS students_attempted,
  SUM(CASE WHEN a.is_correct=1 THEN 1 ELSE 0 END) AS correct_count,
  ROUND(100.0 * SUM(CASE WHEN a.is_correct=1 THEN 1 ELSE 0 END) / NULLIF(SUM(CASE WHEN a.question_answered=1 THEN 1 ELSE 0 END),0), 2) AS accuracy_pct,
  AVG(a.duration) AS avg_time_spent_seconds
FROM noon2_datamart.f_user_assessment a
WHERE a.practice_id = 12345
GROUP BY 1,2,3 ORDER BY accuracy_pct ASC`,
  ],
};

const f_user_reaction: AthenaTableMeta = {
  key: 'f_user_reaction',
  database: 'noon2_datamart',
  table: 'f_user_reaction',
  description:
    'Reactions each user has given in a session — linked to the slide and whether it was part of an activity. ' +
    'Join to d_classroom_activity on session_slide_id to link to activities.',
  grain:
    'course_session_id + user + session_slide_id (activity slide) + emotion + part_of_activity',
  partition: 'dt',
  refreshCadence: 'Every 12 hours',
  accessLevel: 'all',
  scopeColumn: 'user_id',
  scopeType: 'user_id',
  columns: [
    { name: 'course_session_id', type: 'bigint', description: 'Course session ID' },
    { name: 'room_id', type: 'bigint', description: 'Room ID where the reaction was fired' },
    { name: 'user_id', type: 'bigint', description: 'Profile ID of the user who reacted' },
    {
      name: 'event_datetime',
      type: 'timestamp',
      description: 'First event datetime for this reaction group (UTC)',
    },
    {
      name: 'session_slide_id_reaction_made',
      type: 'bigint',
      description:
        'Slide ID at the moment the student clicked the reaction ($.slideid from custommetadata)',
    },
    {
      name: 'session_slide_id',
      type: 'bigint',
      description:
        'Slide ID of the activity linked to the reaction ($.activitymetadata.activityid). Join to d_classroom_activity on this.',
    },
    {
      name: 'emotion',
      type: 'varchar',
      description: 'The emotion/reaction type',
      enumValues: ['confused', 'loved', 'sad', 'skip', 'stronger'],
    },
    {
      name: 'part_of_activity',
      type: 'int',
      description:
        "1 if reaction source is 'activity' or 'activity-slide' (end-of-activity popup or puck), 0 otherwise",
    },
    {
      name: 'total_reactions',
      type: 'bigint',
      description: 'Total number of this reaction type for this grouping',
    },
    { name: 'dt', type: 'int', description: 'Partition column YYYYMMDD' },
  ],
  exampleQueries: [
    `-- In-session reactions summary
SELECT r.course_session_id, r.emotion,
  COUNT(DISTINCT r.user_id) AS unique_students,
  SUM(r.total_reactions) AS total_reactions,
  SUM(CASE WHEN r.is_activity=1 THEN r.total_reactions ELSE 0 END) AS reactions_during_activity,
  SUM(CASE WHEN r.is_activity=0 THEN r.total_reactions ELSE 0 END) AS reactions_outside_activity
FROM noon2_datamart.f_user_reaction r
WHERE r.course_session_id = 12345
GROUP BY 1,2 ORDER BY total_reactions DESC`,
  ],
};

// ---------------------------------------------------------------------------
// LAYER 2 — Dimension Tables
// ---------------------------------------------------------------------------

const d_user: AthenaTableMeta = {
  key: 'd_user',
  database: 'noon2_datamart',
  table: 'd_user',
  description:
    'Distinct list of all profile IDs (user IDs) with relevant information. ' +
    'Includes students, teachers, presenters etc.',
  grain: 'User ID (profile ID)',
  partition: null,
  refreshCadence: 'Every 12 hours',
  accessLevel: 'all',
  scopeColumn: 'user_id',
  scopeType: 'user_id',
  columns: [
    { name: 'user_id', type: 'int', description: 'Unique profile ID (PK)' },
    { name: 'account_id', type: 'int', description: 'Account ID linked to the profile' },
    { name: 'user_name', type: 'varchar', description: 'Name of the profile' },
    {
      name: 'user_type',
      type: 'varchar',
      description: 'User type: STUDENT / TEACHER / PRESENTER etc.',
      enumValues: [
        'ADMIN',
        'FACILITATOR',
        'MENTOR',
        'NOBLE_ADMIN',
        'NOBLE_SUPERVISOR',
        'PRESENTER',
        'SCHOOL_LEAD',
        'SCHOOL_MANAGER',
        'STUDENT',
        'TEACHER',
        'TEACHING_ASSISTANT',
      ],
    },
    {
      name: 'gender',
      type: 'varchar',
      description: 'Gender (default is female)',
      enumValues: ['FEMALE', 'MALE'],
    },
    {
      name: 'locale',
      type: 'varchar',
      description: 'Locale/language e.g. en, ar',
      enumValues: ['ar', 'en', 'ur'],
    },
    {
      name: 'country_name',
      type: 'varchar',
      description:
        "Country name of the account. Use country_name != 'Noon internal' to exclude company employees.",
      enumValues: ['Egypt', 'Iraq', 'Noon internal', 'Pakistan', 'Saudi Arabia', 'Yemen'],
    },
    { name: 'country_iso2_code', type: 'varchar', description: 'ISO2 country code' },
    { name: 'campus_id', type: 'bigint', description: 'Campus ID (for school students)' },
    { name: 'campus_name', type: 'varchar', description: 'Campus name' },
    {
      name: 'campus_type',
      type: 'varchar',
      description: 'Campus type',
      enumValues: ['B2B', 'LABS', 'TRACKS', 'UFFUQ'],
    },
    { name: 'campus_country', type: 'varchar', description: 'Campus country' },
    { name: 'campus_code', type: 'varchar', description: 'Campus code' },
    {
      name: 'campus_allowed_gender',
      type: 'varchar',
      description: 'Allowed gender for the campus',
    },
    {
      name: 'student_status',
      type: 'varchar',
      description: 'School student status: APPLIED / ACTIVE / WITHDRAWN / WAITLISTED / REJECTED',
      enumValues: ['ACTIVE', 'WITHDRAWN'],
    },
    { name: 'student_grade_id', type: 'bigint', description: 'Current grade ID of the student' },
    {
      name: 'student_grade_name',
      type: 'varchar',
      description: 'Current grade name of the student',
    },
    {
      name: 'school_student_enrollment_date',
      type: 'varchar',
      description:
        'Date the student was enrolled to the campus (stored as varchar). Use TRY_CAST(school_student_enrollment_date AS TIMESTAMP) for comparisons.',
    },
    {
      name: 'school_student_withdrawal_date',
      type: 'varchar',
      description:
        'Date the student was withdrawn (stored as varchar). Use TRY_CAST(school_student_withdrawal_date AS TIMESTAMP) for comparisons.',
    },
    {
      name: 'is_school_student_deleted',
      type: 'int',
      description: 'Whether the school student record is deleted',
    },
    {
      name: 'course_ids',
      type: 'array<int>',
      description: 'List of course IDs the profile has joined and is still part of',
    },
    {
      name: 'community_ids',
      type: 'array<int>',
      description: 'Community IDs the profile is part of',
    },
    {
      name: 'device_ids',
      type: 'array<int>',
      description: 'Device IDs that accessed this profile',
    },
    {
      name: 'notifications_enabled',
      type: 'int',
      description: 'Whether notifications are enabled on the app',
    },
    {
      name: 'teacher_profile_type',
      type: 'varchar',
      description: 'For teachers: type of teacher profile',
    },
    { name: 'sponsored_student', type: 'int', description: 'Whether the student is sponsored' },
    {
      name: 'sponsored_student_verified',
      type: 'int',
      description: 'Whether the sponsored student is verified',
    },
    {
      name: 'latest_organisation_id',
      type: 'bigint',
      description: 'Latest organisation ID for verified sponsored students',
    },
    {
      name: 'latest_organisation_name',
      type: 'varchar',
      description: 'Latest organisation name for verified sponsored students',
    },
    {
      name: 'latest_mentor_id',
      type: 'bigint',
      description: 'Latest mentor profile ID for verified sponsored students',
    },
    {
      name: 'latest_verification_date',
      type: 'timestamp',
      description: 'Latest verification date',
    },
    { name: 'avatar_uri', type: 'varchar', description: 'Avatar URI for the profile' },
    { name: 'is_deleted', type: 'int', description: 'Whether the profile is deleted' },
    { name: 'is_deactivated', type: 'int', description: 'Whether the profile is deactivated' },
    { name: 'created_at', type: 'timestamp', description: 'When the profile was created (UTC)' },
    {
      name: 'updated_at',
      type: 'timestamp',
      description: 'When the profile was last updated (UTC)',
    },
    {
      name: 'exam_attempts',
      type: 'array<struct<exam_type:string,attempt_number:int,date:string,quantscore:double,totalscore:double,verbalscore:double,proofofscore:string>>',
      description:
        "Native Athena array of structs (NOT a JSON string) holding official self-reported Qudrat exam attempts. Do NOT use json_parse / json_extract_scalar — they throw TYPE_MISMATCH. Read with CROSS JOIN UNNEST(u.exam_attempts) AS t(att) and access struct fields directly: att.exam_type, att.attempt_number, att.date, att.quantscore, att.totalscore, att.verbalscore, att.proofofscore. Field names are lowercase despite camelCase in upstream source. Fields: exam_type (currently 'qudrat'; 'tahsili' planned), attempt_number (1-based, ordered by date asc), date ('YYYY-MM-DD'), quantscore/totalscore/verbalscore (0–100 doubles), proofofscore (image URL, sometimes absent). Filter placeholder dates with SUBSTR(att.date, 6, 5) <> '01-01'. WARNING: date field has mixed formats ('YYYY-MM-DD' and 'YYYY-MM-DD HH:MM:SS'). Use COALESCE(TRY(DATE_PARSE(att.date, '%Y-%m-%d %H:%i:%s')), TRY(DATE_PARSE(att.date, '%Y-%m-%d'))) for safe parsing.",
    },
  ],
  exampleQueries: [
    `-- Student profiles with grade/country
SELECT user_id, user_name, country_name, gender, locale, student_grade_name
FROM noon2_datamart.d_user
WHERE user_type = 'STUDENT' AND country_name != 'Noon internal'`,
    `-- Tracks students (active)
SELECT COUNT(DISTINCT u.user_id) AS track_count
FROM noon2_datamart.d_user u
JOIN noon2_datamart.d_school_student_courses ssc ON u.user_id = ssc.user_id
WHERE u.campus_type = 'TRACKS' AND u.student_status = 'ACTIVE' AND u.user_type = 'STUDENT' AND u.country_name NOT IN ('Noon internal')`,
    `-- Ufuq school students
SELECT user_id, user_name, campus_type
FROM noon2_datamart.d_user
WHERE campus_type = 'UFFUQ' AND user_type = 'STUDENT' AND student_status = 'ACTIVE' AND country_name != 'Noon internal'`,
  ],
};

const d_course: AthenaTableMeta = {
  key: 'd_course',
  database: 'noon2_datamart',
  table: 'd_course',
  description: 'Distinct list of all courses created with relevant information.',
  grain: 'Course ID',
  partition: null,
  refreshCadence: 'Every 12 hours',
  accessLevel: 'all',
  scopeColumn: null,
  scopeType: null,
  columns: [
    { name: 'course_id', type: 'int', description: 'Unique course ID (PK)' },
    { name: 'course_name', type: 'varchar', description: 'Name of the course' },
    { name: 'course_description', type: 'varchar', description: 'Description of the course' },
    {
      name: 'course_type',
      type: 'varchar',
      description: 'Course type: O2O / Marketplace / School',
      enumValues: ['MARKETPLACE', 'O2O', 'SCHOOL'],
    },
    {
      name: 'course_status',
      type: 'varchar',
      description: 'Current status: active / draft / ended',
      enumValues: ['active', 'draft', 'ended'],
    },
    {
      name: 'teaching_mode',
      type: 'varchar',
      description: 'Teaching mode: ONLINE / HYBRID / OFFLINE',
      enumValues: ['HYBRID', 'OFFLINE', 'ONLINE'],
    },
    {
      name: 'subscription_type',
      type: 'varchar',
      description: 'PAID / FREE / NULL',
      enumValues: ['FREE', 'PAID'],
    },
    { name: 'course_teacher_id', type: 'int', description: 'Profile ID of the course teacher' },
    {
      name: 'subject_id',
      type: 'int',
      description:
        'Subject ID of the course (FK → noon2_core.subject.id). USE THIS for subject classification, never subject_name. 100% populated for school courses. Qudrat IDs: 248=Quant, 249=Verbal, 250=Quant prep. Known school-product IDs: Math (454, 448, 440), Physics (422, 414, 418), Chemistry (453, 445, 439), Biology (421, 417, 437). Multiple IDs per subject = different grade levels.',
    },
    {
      name: 'subject_name',
      type: 'varchar',
      description: 'Subject name (free text — NOT for classification). Use subject_id instead.',
    },
    {
      name: 'subject_level',
      type: 'varchar',
      description:
        'Subject level. ~66% NULL. Values: مبتدئ (beginner), متوسط (intermediate), متقدم (advanced), Level 1, Level 2, Level 3, Foundation, المرحلة الأولى. For Qudrat courses, supplement by parsing المستوى from course_name.',
      enumValues: [
        'Foundation',
        'Level 1',
        'Level 2',
        'Level 3',
        'متقدم',
        'متوسط',
        'مبتدئ',
        'المرحلة الأولى',
      ],
    },
    { name: 'is_mission_based', type: 'int', description: 'Whether the course is mission-based' },
    { name: 'grade_ids', type: 'array<int>', description: 'Grade IDs linked to the course' },
    { name: 'grade_names', type: 'array<varchar>', description: 'Grade names' },
    { name: 'board_ids', type: 'array<int>', description: 'Board IDs linked to the course' },
    { name: 'board_names', type: 'array<varchar>', description: 'Board names' },
    { name: 'country_ids', type: 'array<int>', description: 'Country IDs linked to the course' },
    { name: 'country_names', type: 'array<varchar>', description: 'Country names' },
    {
      name: 'profile_ids',
      type: 'array<int>',
      description: 'Profile IDs of current members (non-cohort joined)',
    },
    {
      name: 'teaching_assistant_ids',
      type: 'array<int>',
      description: 'Teaching assistant profile IDs',
    },
    { name: 'course_section_ids', type: 'array<int>', description: 'Section IDs in the course' },
    {
      name: 'course_sub_section_ids',
      type: 'array<int>',
      description: 'Sub-section IDs in the course',
    },
    { name: 'free_sections', type: 'int', description: 'Total free sections' },
    { name: 'paid_sections', type: 'int', description: 'Total paid sections' },
    { name: 'course_start_date', type: 'date', description: 'Course start date' },
    { name: 'course_end_date', type: 'date', description: 'Course end date' },
    {
      name: 'course_created_at',
      type: 'timestamp',
      description: 'When the course was created (UTC)',
    },
    {
      name: 'course_updated_at',
      type: 'timestamp',
      description: 'When the course was last updated (UTC)',
    },
    { name: 'is_course_deleted', type: 'int', description: 'Whether the course is deleted' },
    { name: 'is_hybrid', type: 'int', description: 'Whether the course is hybrid' },
  ],
  exampleQueries: [
    `-- Course info with teacher name
SELECT a.*, b.user_name AS teacher_name
FROM noon2_datamart.d_course a
INNER JOIN noon2_datamart.d_user b ON a.course_teacher_id = b.user_id`,
    `-- Course members with transaction status
SELECT c.course_id, c.course_name, u.user_id, u.user_name, tr.transaction_id, tr.paid_amount, tr.status AS transaction_status
FROM noon2_datamart.d_course c
CROSS JOIN UNNEST(c.profile_ids) t(pid)
LEFT JOIN noon2_datamart.d_user u ON pid = u.user_id
LEFT JOIN noon2_datamart.f_transaction_details tr ON u.user_id = tr.user_id AND contains(tr.course_ids, c.course_id) AND tr.status = 'COMPLETED'
WHERE c.course_id = 10255`,
  ],
};

const f_transaction_details: AthenaTableMeta = {
  key: 'f_transaction_details',
  database: 'noon2_datamart',
  table: 'f_transaction_details',
  description:
    'Every transaction generated (completed, pending, refunded etc.). ' +
    'A bundle can be a single course or multiple courses. ' +
    'Paid courses can be accessed via O2O (access code) or marketplace (voucher + payment).',
  grain: 'Transaction ID',
  partition: null,
  refreshCadence: 'Every 12 hours',
  accessLevel: 'all',
  scopeColumn: 'user_id',
  scopeType: 'user_id',
  columns: [
    { name: 'transaction_id', type: 'bigint', description: 'Unique transaction ID (PK)' },
    { name: 'invoice_id', type: 'varchar', description: 'Invoice ID linked to the transaction' },
    {
      name: 'user_id',
      type: 'bigint',
      description: 'Profile ID of the user who made the transaction',
    },
    { name: 'bundle_id', type: 'bigint', description: 'Bundle ID from the transaction template' },
    {
      name: 'is_bundle_virtual',
      type: 'int',
      description: 'Whether the bundle is virtual (1=yes)',
    },
    {
      name: 'course_ids',
      type: 'array<bigint>',
      description:
        'Current active course IDs in the bundle at time of refresh (excludes deleted bundle courses)',
    },
    {
      name: 'course_teacher_ids',
      type: 'array<bigint>',
      description: 'Teacher IDs for the courses in the bundle',
    },
    {
      name: 'currency_iso_code',
      type: 'varchar',
      description: 'Currency of the transaction (e.g. SAR, EGP)',
    },
    {
      name: 'gross_amount',
      type: 'double',
      description: 'Original amount in local currency before discount',
    },
    { name: 'gross_amount_usd', type: 'double', description: 'Original amount converted to USD' },
    {
      name: 'paid_amount',
      type: 'double',
      description: 'Amount actually paid in local currency (after voucher discount)',
    },
    { name: 'paid_amount_usd', type: 'double', description: 'Paid amount converted to USD' },
    { name: 'payment_method', type: 'varchar', description: 'Payment method used' },
    {
      name: 'status',
      type: 'varchar',
      description: 'Transaction status',
      enumValues: [
        'COMPLETED',
        'DECLINED',
        'FAILED',
        'PAYMENT_INITIATED',
        'PENDING',
        'REFUNDED',
        'REFUND_INITIATED',
        'REVOKED',
      ],
    },
    {
      name: 'voucher_discount_percentage',
      type: 'bigint',
      description: 'Discount percentage applied by the voucher',
    },
    {
      name: 'is_voucher_redeemed',
      type: 'int',
      description: 'Whether a voucher was redeemed (1=yes)',
    },
    { name: 'voucher_code', type: 'varchar', description: 'Voucher/discount code used (if any)' },
    { name: 'voucher_code_type', type: 'varchar', description: 'Type of voucher code' },
    {
      name: 'start_date',
      type: 'timestamp',
      description: 'Date the student was granted access to paid courses',
    },
    {
      name: 'end_date',
      type: 'timestamp',
      description: 'Date the paid access expires (inclusive)',
    },
    {
      name: 'redeemed_at',
      type: 'timestamp',
      description: 'When the transaction was completed / access code redeemed (UTC)',
    },
    {
      name: 'created_at',
      type: 'timestamp',
      description: 'When the transaction record was created (UTC)',
    },
    {
      name: 'updated_at',
      type: 'timestamp',
      description: 'When the transaction was last updated (UTC)',
    },
    { name: 'template_id', type: 'bigint', description: 'Transaction template / subscription ID' },
    { name: 'subscription_type', type: 'varchar', description: 'Subscription type' },
  ],
  exampleQueries: [
    `-- All completed transactions
SELECT * FROM noon2_datamart.f_transaction_details WHERE status = 'COMPLETED'`,
  ],
};

const f_user_note: AthenaTableMeta = {
  key: 'f_user_note',
  database: 'noon2_datamart',
  table: 'f_user_note',
  description:
    'Unified table of student-related notes created by facilitators. ' +
    'Includes general feedback, one-on-one reflections, session-health task feedback. ' +
    'Note types: TASK_NOTE (SESSION_HEALTH_METRICS), ONE_ON_ONE_NOTE, GENERAL_STUDENT_NOTE.',
  grain: '1 row = 1 note (note_id)',
  partition: null,
  refreshCadence: 'Every 12 hours',
  accessLevel: 'all',
  scopeColumn: 'notee_user_id',
  scopeType: 'user_id',
  columns: [
    { name: 'note_id', type: 'bigint', description: 'Unique identifier of the note (PK)' },
    {
      name: 'note_type',
      type: 'varchar',
      description: 'Original note type: TASK_NOTE, ONE_ON_ONE_NOTE, GENERAL_STUDENT_NOTE',
      enumValues: ['GENERAL_STUDENT_NOTE', 'ONE_ON_ONE_NOTE', 'TASK_NOTE'],
    },
    {
      name: 'note_type_2',
      type: 'varchar',
      description: 'Normalized note type (maps TASK_NOTE → SESSION_HEALTH_METRICS, otherwise same)',
      enumValues: ['GENERAL_STUDENT_NOTE', 'ONE_ON_ONE_NOTE', 'SESSION_HEALTH_METRICS'],
    },
    { name: 'text', type: 'varchar', description: 'Note content/body' },
    {
      name: 'noter_user_id',
      type: 'bigint',
      description: 'User ID of the author (facilitator/supervisor)',
    },
    { name: 'noter_user_name', type: 'varchar', description: 'Display name of the author' },
    {
      name: 'notee_user_id',
      type: 'bigint',
      description: 'User ID of the student the note is about (may be NULL for session-only notes)',
    },
    { name: 'notee_user_name', type: 'varchar', description: 'Display name of the student' },
    { name: 'created_at', type: 'timestamp', description: 'Note creation time (UTC)' },
    { name: 'updated_at', type: 'timestamp', description: 'Last update time (UTC)' },
  ],
  exampleQueries: [
    `-- All facilitator notes
SELECT * FROM noon2_datamart.f_user_note`,
  ],
};

// ---------------------------------------------------------------------------
// LAYER 2 — Additional Dimension Tables
// ---------------------------------------------------------------------------

const d_school_student_courses: AthenaTableMeta = {
  key: 'd_school_student_courses',
  database: 'noon2_datamart',
  table: 'd_school_student_courses',
  description:
    'All school students with their current cohorts and courses. ' +
    'Cohorts can belong to multiple grades — a student may appear multiple times for the same course. ' +
    'Use student_grade_id for current grade. Excludes NM country and Noon Labs/Tracks campus. ' +
    'Removed students no longer appear.',
  grain: 'User ID + cohort_id + course_id + cohort_grade_id',
  partition: null,
  refreshCadence: 'Every 12 hours',
  accessLevel: 'all',
  scopeColumn: 'user_id',
  scopeType: 'user_id',
  columns: [
    { name: 'user_id', type: 'int', description: 'Profile ID of the student (PK part)' },
    { name: 'cohort_id', type: 'int', description: 'Cohort ID the student is part of' },
    { name: 'cohort_name', type: 'varchar', description: 'Name of the cohort' },
    { name: 'course_id', type: 'int', description: 'Course ID part of the cohort' },
    {
      name: 'cohort_grade_id',
      type: 'int',
      description: 'Grade ID of the cohort (grades in the cohort)',
    },
    { name: 'cohort_grade_name', type: 'varchar', description: 'Grade name of the cohort' },
    {
      name: 'student_grade_id',
      type: 'int',
      description: 'Current grade ID of the student (from profile)',
    },
    {
      name: 'student_grade_name',
      type: 'varchar',
      description: 'Current grade name of the student',
    },
    {
      name: 'student_status',
      type: 'varchar',
      description: 'Status: APPLIED / ACTIVE / WITHDRAWN / WAITLISTED / REJECTED',
      enumValues: ['ACTIVE'],
    },
    { name: 'facilitator_id', type: 'int', description: 'Profile ID of the cohort facilitator' },
    {
      name: 'facilitator_name',
      type: 'varchar',
      description: 'Display name of the cohort facilitator',
    },
    { name: 'campus_id', type: 'bigint', description: 'Campus ID' },
    { name: 'campus_name', type: 'varchar', description: 'Campus name' },
    {
      name: 'campus_type',
      type: 'varchar',
      description: 'Campus type',
      enumValues: ['B2B', 'LABS', 'TRACKS', 'UFFUQ'],
    },
    { name: 'campus_code', type: 'varchar', description: 'Campus code' },
    {
      name: 'campus_allowed_gender',
      type: 'varchar',
      description: 'Allowed gender for the campus',
      enumValues: ['COED', 'FEMALE', 'MALE'],
    },
    { name: 'campus_country', type: 'varchar', description: 'Country of the campus' },
    { name: 'user_name', type: 'varchar', description: 'Display name of the student' },
    {
      name: 'country_iso2_code',
      type: 'varchar',
      description: "ISO2 country code of the student's account",
    },
    {
      name: 'lane_id',
      type: 'varchar',
      description:
        'Lane ID. Values: LANETB_3 (Speed Limit / الاعتيادي, ×1.0), LANETB_4/LANETB_5 (Speeding / الخط السريع, ×2/×3), LANETB_6/LANETB_7 (Secret Path / المسار السري, ×2). Lanes were S1-only — no flag indicates this.',
      enumValues: ['LANETB_3', 'LANETB_4', 'LANETB_5', 'LANETB_6', 'LANETB_7'],
    },
    { name: 'lane_name', type: 'varchar', description: 'Lane name' },
    {
      name: 'lane_multiplier',
      type: 'double',
      description: 'Lane multiplier for practice/revision targets',
    },
  ],
};

const d_chapter: AthenaTableMeta = {
  key: 'd_chapter',
  database: 'noon2_datamart',
  table: 'd_chapter',
  description: 'Distinct list of all chapters with relevant information.',
  grain: 'Chapter ID',
  partition: null,
  refreshCadence: 'Every 12 hours',
  accessLevel: 'all',
  scopeColumn: null,
  scopeType: null,
  columns: [
    { name: 'chapter_id', type: 'int', description: 'Unique chapter ID (PK)' },
    { name: 'chapter_name', type: 'varchar', description: 'Name of the chapter' },
    { name: 'chapter_sequence_number', type: 'int', description: 'Sequence number of the chapter' },
    {
      name: 'subject_id',
      type: 'int',
      description:
        'Subject ID linked to the chapter (FK → noon2_core.subject.id). USE THIS for subject classification, never subject_name. 100% populated for school courses. Qudrat IDs: 248=Quant, 249=Verbal, 250=Quant prep.',
    },
    {
      name: 'subject_name',
      type: 'varchar',
      description: 'Subject name (free text — NOT for classification). Use subject_id instead.',
    },
    { name: 'grade_ids', type: 'array<int>', description: 'Grade IDs linked to the chapter' },
    { name: 'board_ids', type: 'array<int>', description: 'Board IDs linked to the chapter' },
    { name: 'learning_goal_id', type: 'int', description: 'Learning goal ID' },
    { name: 'learning_goal_name', type: 'varchar', description: 'Learning goal name' },
    { name: 'subject_image_uri', type: 'varchar', description: 'Image URI of the subject' },
    { name: 'is_chapter_deleted', type: 'int', description: 'Whether the chapter is deleted' },
  ],
};

const d_question: AthenaTableMeta = {
  key: 'd_question',
  database: 'noon2_datamart',
  table: 'd_question',
  description:
    'List of all questions in the question bank that have a board, grade and subject. ' +
    'Unique on question_id + board_id + grade_id + subject_id + chapter_id + topic_id + exam_paper_id. ' +
    'Deleted questions may have NULL tags. Only active tags are shown.',
  grain: 'question_id + board_id + grade_id + subject_id + chapter_id + topic_id + exam_paper_id',
  partition: null,
  refreshCadence: 'Every 12 hours',
  accessLevel: 'all',
  scopeColumn: null,
  scopeType: null,
  columns: [
    { name: 'question_id', type: 'bigint', description: 'Question ID (PK)' },
    { name: 'question', type: 'varchar', description: 'The question text (NULL if empty)' },
    {
      name: 'question_url',
      type: 'varchar',
      description: 'URL of the image in the question (NULL if empty)',
    },
    {
      name: 'question_format',
      type: 'varchar',
      description: 'Format derived from text/url presence',
      enumValues: ['image and text', 'image only', 'text only', 'other'],
    },
    { name: 'question_format_2', type: 'varchar', description: 'Secondary format classification' },
    {
      name: 'question_type',
      type: 'varchar',
      description: 'Whether the question has a correct answer',
      enumValues: ['has correct answer', 'no correct answer'],
    },
    {
      name: 'correct_choice_id',
      type: 'bigint',
      description: 'ID of the correct choice. NULL if no correct answer.',
    },
    {
      name: 'choice_ids',
      type: 'array<bigint>',
      description: 'Set of all non-deleted choice IDs for this question',
    },
    { name: 'total_choices', type: 'bigint', description: 'Count of distinct non-deleted choices' },
    { name: 'creator_id', type: 'bigint', description: 'Profile ID of the question creator' },
    {
      name: 'board_id',
      type: 'int',
      description: 'Board ID (single board per question in current setup)',
    },
    {
      name: 'grade_id',
      type: 'int',
      description: 'Grade ID (single grade per question in current setup)',
    },
    {
      name: 'subject_id',
      type: 'int',
      description:
        'Subject ID (FK → noon2_core.subject.id). USE THIS for subject classification, never subject_name. 100% populated for school courses. Qudrat IDs: 248=Quant, 249=Verbal, 250=Quant prep. Known school-product IDs: Math (454, 448, 440), Physics (422, 414, 418), Chemistry (453, 445, 439), Biology (421, 417, 437). Multiple IDs per subject = different grade levels.',
    },
    {
      name: 'subject_name',
      type: 'varchar',
      description:
        'Subject name (free text, NOT for classification). To identify subjects, use subject_id instead. Qudrat IDs: 248=Quant, 249=Verbal, 250=Quant prep.',
    },
    { name: 'chapter_id', type: 'int', description: 'Chapter ID (NULL for deleted questions)' },
    {
      name: 'chapter_name',
      type: 'array<varchar>',
      description:
        'Chapter name. Array since Nov 2024. Use chapter_name[1] to get the first value.',
    },
    { name: 'topic_id', type: 'int', description: 'Topic ID (NULL if no topic tagged)' },
    { name: 'topic_name', type: 'varchar', description: 'Topic name' },
    {
      name: 'difficulty_level',
      type: 'int',
      description: 'Difficulty 1-5 (1=easy, 5=hard) or NULL',
    },
    {
      name: 'exam_paper',
      type: 'varchar',
      description: 'Exam paper name (mostly NULL, some noon1 imports)',
    },
    {
      name: 'exam_paper_id',
      type: 'int',
      description: 'Exam paper ID (mostly NULL, some noon1 imports)',
    },
    { name: 'is_deleted', type: 'int', description: 'Whether the question is deleted' },
    {
      name: 'has_explanation',
      type: 'int',
      description: 'Whether the question has an explanation',
    },
    { name: 'explanation_type', type: 'varchar', description: 'Type of explanation' },
    { name: 'has_reference', type: 'int', description: 'Whether the question has a reference' },
    { name: 'reference', type: 'varchar', description: 'Reference text' },
    {
      name: 'is_suitable_for_practice',
      type: 'int',
      description: 'Whether the question is suitable for practice',
    },
    { name: 'created_at', type: 'timestamp', description: 'When the question was created (UTC)' },
    {
      name: 'updated_at',
      type: 'timestamp',
      description: 'When the question was last updated (UTC)',
    },
  ],
};

const d_assessment: AthenaTableMeta = {
  key: 'd_assessment',
  database: 'noon2_datamart',
  table: 'd_assessment',
  description: 'Information related to assessments and homeworks (practice hub).',
  grain: 'practice_id',
  partition: null,
  refreshCadence: 'Every 12 hours',
  accessLevel: 'all',
  scopeColumn: null,
  scopeType: null,
  columns: [
    {
      name: 'practice_id',
      type: 'varchar',
      description: 'Practice session ID (PK of the practice record)',
    },
    {
      name: 'practice_created_at',
      type: 'timestamp',
      description: 'When the practice record was created (UTC)',
    },
    {
      name: 'practice_updated_at',
      type: 'timestamp',
      description: 'When the practice record was last updated (UTC)',
    },
    {
      name: 'practice_assessment_id',
      type: 'varchar',
      description: 'Practice assessment ID (join to f_user_assessment.practice_assessment_id)',
    },
    {
      name: 'assessment_type',
      type: 'varchar',
      description: 'Type of assessment',
      enumValues: [
        'DIAGNOSTIC',
        'END_OF_CHAPTER',
        'END_OF_SEMESTER',
        'HOMEWORK',
        'MOCK_MISSION',
        'ONLINE',
        'OTHER',
        'QUDRAT_SIMULATOR',
        'TAHSILI_SIMULATOR',
      ],
    },
    { name: 'practice_assessment_title', type: 'varchar', description: 'Title of the assessment' },
    { name: 'board_id', type: 'int', description: 'Board ID of the assessment (single board)' },
    {
      name: 'subject_id',
      type: 'int',
      description:
        'Subject ID of the assessment (FK → noon2_core.subject.id). USE THIS for subject classification, never subject_name. 100% populated for school courses. Qudrat IDs: 248=Quant, 249=Verbal, 250=Quant prep. Known school-product IDs: Math (454, 448, 440), Physics (422, 414, 418), Chemistry (453, 445, 439), Biology (421, 417, 437). Multiple IDs per subject = different grade levels.',
    },
    {
      name: 'chapter_ids',
      type: 'array<bigint>',
      description: 'Chapter IDs covered by the assessment',
    },
    {
      name: 'topic_ids',
      type: 'array<bigint>',
      description: 'Topic IDs covered by the assessment',
    },
    {
      name: 'practice_assessment_duration',
      type: 'bigint',
      description: 'Duration of the assessment in minutes',
    },
    {
      name: 'practice_assessment_min_score',
      type: 'int',
      description: 'Minimum score / pass mark',
    },
    {
      name: 'practice_assessment_status',
      type: 'varchar',
      description: 'Status of the assessment (e.g. ACTIVE)',
    },
    {
      name: 'original_practice_assessment_id',
      type: 'varchar',
      description: 'For MOCK_MISSION only: the actual practice assessment ID linked',
    },
    {
      name: 'total_questions',
      type: 'bigint',
      description: 'Count of distinct question IDs in the assessment',
    },
    { name: 'question_ids', type: 'array<bigint>', description: 'Question IDs in the assessment' },
    {
      name: 'course_ids',
      type: 'array<bigint>',
      description:
        'Course IDs that are scheduled to take this assessment (via schedule → school_calendar)',
    },
  ],
  exampleQueries: [
    `-- Homework assignment tracking: d_assessment → schedule chain → course
-- ⭐ For completion analysis, prefer noon2_replit.homework_completion_kyy instead
SELECT
    d.practice_assessment_id,
    d.practice_assessment_title,
    d.total_questions,
    sc.entity_id AS course_id,
    CAST(s.start_date AS timestamp) AS assigned_start,
    CAST(s.end_date AS timestamp) AS assigned_end
FROM noon2_datamart.d_assessment d
INNER JOIN noon2_core.assessment_schedule as2
    ON d.practice_assessment_id = as2.practice_assessment_id
INNER JOIN noon2_core.schedule s
    ON as2.schedule_id = s.id
    AND s.is_deleted = 0
INNER JOIN noon2_core.school_calendar sc
    ON s.school_calendar_id = sc.id
    AND sc.entity_type = 'COURSE'
WHERE d.assessment_type = 'HOMEWORK'`,
  ],
};

const d_classroom_activity: AthenaTableMeta = {
  key: 'd_classroom_activity',
  database: 'noon2_datamart',
  table: 'd_classroom_activity',
  description:
    'Information related to activities in a classroom. ' +
    'Before 13/06/2025: only activities with at least 1 student answer. ' +
    'From 13/06/2025: includes all planned activities.',
  grain: 'activity_id',
  partition: null,
  refreshCadence: 'Every 12 hours',
  accessLevel: 'all',
  scopeColumn: null,
  scopeType: null,
  columns: [
    { name: 'activity_id', type: 'bigint', description: 'Unique activity ID (PK)' },
    { name: 'course_session_id', type: 'bigint', description: 'Course session ID' },
    {
      name: 'type',
      type: 'varchar',
      description: 'Activity type: CUSTOM, etc.',
      enumValues: [
        'ANNOTATION_RESPONSE',
        'BETTER_CALL_SAUL',
        'CUSTOM',
        'DRAG_AND_DROP_RESPONSE',
        'EMBEDDED',
        'EXIT_TICKET',
        'MARATHON',
        'OPEN_RESPONSE',
        'QUESTION',
        'REVIEW',
        'SECTION_CHECK',
        'SQUID_GAME',
        'TEAM_DUEL',
        'TEAM_EXERCISE',
      ],
    },
    {
      name: 'activity_happened',
      type: 'int',
      description: '1 if the activity actually happened (start_time not null)',
    },
    { name: 'duration', type: 'int', description: 'Actual duration in minutes (only if happened)' },
    {
      name: 'session_class_type',
      type: 'varchar',
      description: 'Class type of the session the activity belongs to',
      enumValues: ['LIVE_CLASS', 'LIVE_MASTERY'],
    },
    { name: 'planned_duration', type: 'int', description: 'Planned duration in seconds' },
    {
      name: 'duration',
      type: 'int',
      description: 'Actual duration in seconds (unix_timestamp diff of end_time - start_time)',
    },
    { name: 'total_mcqs', type: 'int', description: 'Total MCQs in the activity' },
    { name: 'mcq_ids', type: 'array<bigint>', description: 'Set of MCQ IDs in the activity' },
    {
      name: 'question_ids',
      type: 'array<bigint>',
      description: 'Set of question IDs in the activity',
    },
    {
      name: 'room_ids',
      type: 'array<bigint>',
      description: 'Set of room IDs where this activity occurred',
    },
    {
      name: 'creator_id',
      type: 'bigint',
      description: 'Profile ID of the activity creator (usually session teacher)',
    },
    {
      name: 'mcq_types',
      type: 'array<varchar>',
      description: 'Set of MCQ types in the activity (e.g. CUSTOM, QUESTION, MARATHON)',
    },
    { name: 'start_time', type: 'timestamp', description: 'When the activity started (UTC)' },
    { name: 'end_time', type: 'timestamp', description: 'When the activity ended (UTC)' },
    {
      name: 'created_at',
      type: 'timestamp',
      description: 'When the activity was created/added to session (UTC)',
    },
    {
      name: 'activity_status',
      type: 'varchar',
      description: 'Activity status.',
      enumValues: ['DELETED', 'HELD', 'IGNORED'],
    },
    {
      name: 'sub_type',
      type: 'varchar',
      description: 'Activity sub-type for EMBEDDED/Nolt activities.',
      enumValues: [
        'demo-pubnoon',
        'esl-writing-assessment-001',
        'pokenoon',
        'pokenoon-v3',
        'pubnoon',
      ],
    },
  ],
};

const d_bundle: AthenaTableMeta = {
  key: 'd_bundle',
  database: 'noon2_datamart',
  table: 'd_bundle',
  description: 'Distinct list of bundles with relevant information.',
  grain: 'Bundle ID',
  partition: null,
  refreshCadence: 'Every 12 hours',
  accessLevel: 'all',
  scopeColumn: null,
  scopeType: null,
  columns: [
    { name: 'bundle_id', type: 'bigint', description: 'Unique bundle ID (PK)' },
    {
      name: 'bundle_name',
      type: 'varchar',
      description: 'Name of the bundle (virtual bundles: subject | board | grade | teacher)',
    },
    { name: 'bundle_description', type: 'varchar', description: 'Description of the bundle' },
    { name: 'bundle_type', type: 'varchar', description: 'Type of bundle (currently all O2O)' },
    { name: 'bundle_invoice_name', type: 'varchar', description: 'Invoice name (set by admin)' },
    {
      name: 'course_ids',
      type: 'array<bigint>',
      description: 'Current active course IDs in the bundle (excludes deleted bundle courses)',
    },
    {
      name: 'course_ids_all_time',
      type: 'array<bigint>',
      description: 'All course IDs ever in the bundle including deleted ones',
    },
    {
      name: 'teacher_ids',
      type: 'array<bigint>',
      description: 'Teacher IDs of active courses in the bundle',
    },
    {
      name: 'grade_names',
      type: 'array<varchar>',
      description: 'Grade names from active courses in the bundle',
    },
    {
      name: 'country_names',
      type: 'array<varchar>',
      description: 'Country names from active courses in the bundle',
    },
    {
      name: 'board_names',
      type: 'array<varchar>',
      description: 'Board names from active courses in the bundle',
    },
    {
      name: 'earliest_course_start_date',
      type: 'date',
      description: 'Earliest course start date across all courses in the bundle',
    },
    {
      name: 'latest_course_end_date',
      type: 'date',
      description: 'Latest course end date across all courses in the bundle',
    },
    {
      name: 'bundle_created_at',
      type: 'timestamp',
      description: 'When the bundle was created (UTC)',
    },
    {
      name: 'bundle_updated_at',
      type: 'timestamp',
      description: 'When the bundle was last updated (UTC)',
    },
    {
      name: 'bundle_created_by',
      type: 'bigint',
      description: 'Profile ID that created the bundle',
    },
    {
      name: 'is_bundle_virtual',
      type: 'int',
      description: 'Whether the bundle is virtual (1=yes)',
    },
    {
      name: 'is_bundle_deleted',
      type: 'int',
      description: 'Whether the bundle is deleted (1=yes)',
    },
  ],
};

const d_mission: AthenaTableMeta = {
  key: 'd_mission',
  database: 'noon2_datamart',
  table: 'd_mission',
  description:
    'Distinct list of missions with relevant information. ' +
    'See COMMON JOIN PATTERNS for mission → assessment and mission → ODM joins.',
  grain: 'mission_id',
  partition: null,
  refreshCadence: 'Every 12 hours',
  accessLevel: 'all',
  scopeColumn: null,
  scopeType: null,
  columns: [
    { name: 'mission_id', type: 'varchar', description: 'Unique mission ID (PK)' },
    {
      name: 'mission_expected_session_count',
      type: 'int',
      description: 'Expected number of sessions in this mission',
    },
    {
      name: 'mission_default_practice_target_for_session',
      type: 'int',
      description: 'Default ODM practice target per session',
    },
    {
      name: 'mission_default_practice_target_for_revision',
      type: 'int',
      description: 'Default ODM practice target for revision',
    },
    { name: 'mission_type', type: 'varchar', description: 'Type of mission (MISSION)' },
    {
      name: 'course_section_id',
      type: 'bigint',
      description: 'Course section ID this mission belongs to',
    },
    { name: 'course_section_name', type: 'varchar', description: 'Course section name' },
    {
      name: 'course_section_sequence',
      type: 'int',
      description: 'Sequence number of the section within the course',
    },
    { name: 'course_id', type: 'bigint', description: 'Course ID' },
    {
      name: 'subject_id',
      type: 'int',
      description:
        'Subject ID of the course (FK → noon2_core.subject.id). USE THIS for subject classification, never subject_name. Qudrat IDs: 248=Quant, 249=Verbal, 250=Quant prep.',
    },
    {
      name: 'course_section_chapter_ids',
      type: 'array<bigint>',
      description: 'Chapter IDs tagged to the course section',
    },
    {
      name: 'course_session_ids',
      type: 'array<bigint>',
      description: 'Course session IDs belonging to this section',
    },
    {
      name: 'evaluation_id',
      type: 'varchar',
      description:
        'Evaluation ID for this mission (join to f_user_poll via evaluation_id for ODM revision)',
    },
    { name: 'evaluation_name', type: 'varchar', description: 'Evaluation name' },
    {
      name: 'evaluation_due_date',
      type: 'timestamp',
      description: 'Due date of the evaluation (UTC)',
    },
    { name: 'evaluation_type', type: 'varchar', description: 'Evaluation type (MISSION)' },
    {
      name: 'evaluation_chapter_ids',
      type: 'array<bigint>',
      description: 'Chapter IDs in the evaluation',
    },
    {
      name: 'evaluation_chapter_names',
      type: 'array<varchar>',
      description: 'Chapter names in the evaluation',
    },
    {
      name: 'evaluation_practice_assessment_id',
      type: 'varchar',
      description:
        'Practice assessment ID for the evaluation (join to f_user_assessment.practice_assessment_id)',
    },
    {
      name: 'mission_created_at',
      type: 'timestamp',
      description: 'When the mission was created (UTC)',
    },
    {
      name: 'mission_updated_at',
      type: 'timestamp',
      description: 'When the mission was last updated (UTC)',
    },
  ],
  exampleQueries: [
    `-- Mission info with course details
SELECT m.mission_id, m.mission_type, m.course_id, c.course_name, m.evaluation_id, m.mission_expected_session_count
FROM noon2_datamart.d_mission m
LEFT JOIN noon2_datamart.d_course c ON m.course_id = c.course_id`,
    `-- Mission revision practice (ODM) performance
SELECT m.mission_id, m.evaluation_id,
  COUNT(DISTINCT p.user_id) AS students_practiced,
  SUM(CASE WHEN p.is_correct_answer=1 THEN 1 ELSE 0 END) AS correct_answers,
  ROUND(100.0 * SUM(CASE WHEN p.is_correct_answer=1 THEN 1 ELSE 0 END) / NULLIF(SUM(CASE WHEN p.poll_answered=1 THEN 1 ELSE 0 END),0), 2) AS accuracy_pct
FROM noon2_datamart.d_mission m
INNER JOIN noon2_datamart.f_user_poll p ON m.evaluation_id = p.evaluation_id
WHERE p.poll_type = 'on-demand mastery'
GROUP BY 1,2`,
  ],
};

// ---------------------------------------------------------------------------
// LAYER 3 — Additional Aggregation Tables
// ---------------------------------------------------------------------------

const f_user_segment: AthenaTableMeta = {
  key: 'f_user_segment',
  database: 'noon2_datamart',
  table: 'f_user_segment',
  description:
    'Per-user, per-segment breakdown of poll activity within a live session. ' +
    'Covers BREAKOUT, LIVE_MASTERY, and MAIN segment types. ' +
    'MAIN segments have segment_id = NULL (no MongoDB segmentId) and represent the teacher-led session portion. ' +
    'BREAKOUT and LIVE_MASTERY have a segment_id. ' +
    'Sentiment is derived from reactions per segment.',
  grain:
    'user_id + segment_id (BREAKOUT/LIVE_MASTERY) or user_id + course_session_id (MAIN where segment_id = NULL)',
  partition: 'dt',
  refreshCadence: 'Every 12 hours',
  accessLevel: 'all',
  scopeColumn: 'user_id',
  scopeType: 'user_id',
  columns: [
    { name: 'user_id', type: 'bigint', description: 'Profile ID of the user' },
    { name: 'course_session_id', type: 'bigint', description: 'Course session ID' },
    { name: 'segment_id', type: 'varchar', description: 'Segment ID. NULL for MAIN segments.' },
    {
      name: 'segment_type',
      type: 'varchar',
      description: 'Type of segment',
      enumValues: ['BREAKOUT', 'LIVE_MASTERY', 'MAIN'],
    },
    {
      name: 'segment_start_time',
      type: 'varchar',
      description: 'When the segment started (UTC, stored as string)',
    },
    {
      name: 'segment_end_time',
      type: 'varchar',
      description: 'When the segment ended (UTC, stored as string)',
    },
    {
      name: 'segment_duration_mins',
      type: 'decimal(27,2)',
      description: 'Duration of the segment in minutes',
    },
    { name: 'total_slides', type: 'int', description: 'Total slides in the segment' },
    { name: 'total_activities', type: 'int', description: 'Total activities in the segment' },
    { name: 'total_polls', type: 'int', description: 'Total polls/MCQs in the segment' },
    {
      name: 'total_polls_seen',
      type: 'int',
      description: 'Total polls seen by the user in this segment',
    },
    {
      name: 'total_polls_answered',
      type: 'int',
      description: 'Total polls answered by the user in this segment',
    },
    {
      name: 'total_polls_correct',
      type: 'int',
      description: 'Total polls answered correctly by the user',
    },
    {
      name: 'poll_accuracy_rate',
      type: 'double',
      description: 'Accuracy rate: total_polls_correct / total_polls_answered',
    },
    {
      name: 'avg_poll_duration_secs',
      type: 'double',
      description: 'Average time the user spent per poll in seconds',
    },
    {
      name: 'active_time_mins',
      type: 'decimal(38,2)',
      description:
        'Active time in minutes from MongoDB. For BREAKOUT/LIVE_MASTERY: joined via segmentId. For MAIN: joined via main_room_id.',
    },
    {
      name: 'active_time_ratio',
      type: 'decimal(38,2)',
      description: 'active_time_mins / segment_duration_mins. NULL if segment_duration_mins = 0.',
    },
    {
      name: 'user_segment_sentiment',
      type: 'varchar',
      description: 'Sentiment classification for the user in this segment based on reactions',
      enumValues: ['negative', 'neutral', 'positive'],
    },
    {
      name: 'has_spotlight',
      type: 'int',
      description:
        '1 if a Breakout Spotlight occurred for this breakout segment (teacherinterventionneeded=true in BREAKOUT_SPOTLIGHT_STATS). Always 0 for MAIN and LIVE_MASTERY segments.',
    },
    {
      name: 'spotlight_mcq_count',
      type: 'double',
      description:
        'Number of MCQ slides reviewed in the Spotlight (MAX of spotlightmcqslidecount across STATS events). NULL if no spotlight. Only populated for BREAKOUT segments with has_spotlight=1.',
    },
    {
      name: 'spotlight_duration_seconds',
      type: 'double',
      description:
        'Duration of the Spotlight in seconds (BREAKOUT_SPOTLIGHT_VIEW_END minus VIEW_START). NULL if no spotlight or no matching VIEW events. Only populated for BREAKOUT segments.',
    },
    {
      name: 'breakout_mcq_count',
      type: 'bigint',
      description:
        "Count of distinct MCQ polls the user was exposed to in this breakout segment (poll_type='mcq' in f_user_poll). NULL for MAIN segments.",
    },
    {
      name: 'reduction_rate',
      type: 'double',
      description:
        'Spotlight efficiency: (breakout_mcq_count - spotlight_mcq_count) / breakout_mcq_count * 100. Higher = teacher reviewed fewer MCQs (breakout went well). NULL if no spotlight or breakout_mcq_count = 0.',
    },
    { name: 'dt', type: 'int', description: 'Partition column YYYYMMDD' },
  ],
};

const d_practice_target: AthenaTableMeta = {
  key: 'd_practice_target',
  database: 'noon2_datamart',
  table: 'd_practice_target',
  description:
    'Weekly practice targets per course, lane, and week for mission-based courses. ' +
    'Two source types: SESSION (target per session) and EVALUATION (target per revision evaluation). ' +
    'Only includes active, non-deleted, mission-based courses with a future end date.',
  grain: 'course_id + course_week_id + lane_id + practice_source_id',
  partition: 'dt',
  refreshCadence: 'Every 12 hours',
  accessLevel: 'all',
  scopeColumn: null,
  scopeType: null,
  columns: [
    { name: 'course_id', type: 'bigint', description: 'Course ID' },
    {
      name: 'course_week_id',
      type: 'int',
      description: 'Course week ID (from course_weeks table)',
    },
    {
      name: 'chapter_ids',
      type: 'array<int>',
      description: 'Chapter IDs tagged to the source (session tags or evaluation chapters)',
    },
    {
      name: 'topic_ids',
      type: 'array<int>',
      description: 'Topic IDs tagged to the source. NULL for EVALUATION type.',
    },
    {
      name: 'lane_id',
      type: 'varchar',
      description: 'Lane ID (each lane has a multiplier that scales the default target)',
    },
    {
      name: 'week_start_date',
      type: 'timestamp',
      description: 'Start date of the course week (UTC)',
    },
    { name: 'week_end_date', type: 'timestamp', description: 'End date of the course week (UTC)' },
    {
      name: 'practice_source_id',
      type: 'varchar',
      description: 'ID of the source: course_session_id (SESSION) or evaluation_id (EVALUATION)',
    },
    {
      name: 'practice_source_type',
      type: 'varchar',
      description: 'Source type: SESSION or EVALUATION',
      enumValues: ['EVALUATION', 'SESSION'],
    },
    {
      name: 'practice_source_start_date',
      type: 'timestamp',
      description: 'Scheduled start time of the session or due date of the evaluation (UTC)',
    },
    {
      name: 'target',
      type: 'int',
      description:
        'Practice target = lane.multiplier × mission default target (for_session or for_revision)',
    },
    {
      name: 'dt',
      type: 'bigint',
      description: "Partition column YYYYMMDD (yesterday's date at time of refresh)",
    },
  ],
};

// ---------------------------------------------------------------------------
// AI-Generated Tables
// ---------------------------------------------------------------------------

const ai_chat_message_labeled_emotions_with_reason: AthenaTableMeta = {
  key: 'ai_chat_message_labeled_emotions_with_reason',
  database: 'noon2_datamart',
  table: 'ai_chat_message_labeled_emotions_with_reason',
  description:
    'AI-classified emotions of student chat messages during online learning sessions. ' +
    'Classified by AWS Bedrock Claude Haiku. School sessions only, students only. ' +
    'Messages 2-100 chars, excluding greetings/numbers. ' +
    'Emotions: loved, stronger, sad, confused, neutral. ' +
    'Daily at 7 AM UTC.',
  grain: 'message_id',
  partition: null,
  refreshCadence: 'Daily at 7 AM UTC',
  accessLevel: 'all',
  scopeColumn: 'user_id',
  scopeType: 'user_id',
  columns: [
    { name: 'message_id', type: 'varchar', description: 'Unique identifier for the chat message' },
    { name: 'user_id', type: 'int', description: 'Student user ID (creator of the message)' },
    { name: 'course_session_id', type: 'int', description: 'Course session ID' },
    {
      name: 'message_text',
      type: 'varchar',
      description: 'Chat message text (2-100 chars, Arabic/English)',
    },
    {
      name: 'derived_emotion',
      type: 'varchar',
      description: 'AI-classified emotion: loved, stronger, sad, confused, neutral',
      enumValues: ['confused', 'loved', 'neutral', 'sad', 'stronger'],
    },
    {
      name: 'reason',
      type: 'varchar',
      description:
        'Reason subcategory: technical_issue, understanding_issue, clear_understanding, gratitude_appreciation, etc.',
      enumValues: [
        'clear_understanding',
        'engagement_frustration',
        'gratitude_appreciation',
        'high_engagement',
        'none',
        'other',
        'praise',
        'technical_issue',
        'time_pressure',
        'understanding_issue',
      ],
    },
    { name: 'created_at_ts', type: 'timestamp', description: 'When the chat message was created' },
  ],
  exampleQueries: [
    `-- AI chat sentiment for a session
SELECT ai.course_session_id, ai.derived_emotion, ai.reason, ai.created_at_ts
FROM noon2_datamart.ai_chat_message_labeled_emotions_with_reason ai
WHERE ai.course_session_id = 68059
ORDER BY ai.created_at_ts DESC`,
  ],
};

// ---------------------------------------------------------------------------
// RAW SOURCE TABLES (noon2_core — sqooped from production MySQL)
// ---------------------------------------------------------------------------

const assessment_schedule: AthenaTableMeta = {
  key: 'assessment_schedule',
  database: 'noon2_core',
  table: 'assessment_schedule',
  description:
    'Bridge table linking homework (and other assessments) to a schedule entry. ' +
    'Join d_assessment ON practice_assessment_id, then noon2_core.schedule ON schedule_id ' +
    'to get assignment dates. Required for any homework scheduling/due-date analysis.',
  grain: '1 row = schedule_id + practice_assessment_id',
  partition: null,
  refreshCadence: 'Daily (sqooped)',
  accessLevel: 'all',
  scopeColumn: null,
  scopeType: null,
  columns: [
    { name: 'schedule_id', type: 'bigint', description: 'FK → noon2_core.schedule.id' },
    {
      name: 'practice_assessment_id',
      type: 'string',
      description:
        'FK → d_assessment.practice_assessment_id / f_user_assessment.practice_assessment_id',
    },
  ],
};

const noon2_core_schedule: AthenaTableMeta = {
  key: 'noon2_core_schedule',
  database: 'noon2_core',
  table: 'schedule',
  description:
    'Schedule entries for courses — start/end dates and times for homework, classes, and other calendar events. ' +
    'Join via noon2_core.school_calendar (school_calendar_id) to link to a course. ' +
    'Always filter is_deleted = 0.',
  grain: '1 row = schedule entry (id)',
  partition: null,
  refreshCadence: 'Daily (sqooped)',
  accessLevel: 'all',
  scopeColumn: null,
  scopeType: null,
  columns: [
    {
      name: 'id',
      type: 'bigint',
      description: 'Schedule ID (PK, FK ← assessment_schedule.schedule_id)',
    },
    {
      name: 'school_calendar_id',
      type: 'bigint',
      description: 'FK → noon2_core.school_calendar.id',
    },
    { name: 'title', type: 'string', description: 'Schedule entry title (e.g. homework title)' },
    { name: 'description', type: 'string', description: 'Optional description' },
    { name: 'event_type', type: 'string', description: 'Type of event (e.g. HOMEWORK, CLASS)' },
    { name: 'class_type', type: 'string', description: 'Class type if applicable' },
    { name: 'link_url', type: 'string', description: 'External URL if applicable' },
    {
      name: 'start_date',
      type: 'string',
      description: 'Assignment start date (stored as string — CAST to timestamp for date logic)',
    },
    {
      name: 'end_date',
      type: 'string',
      description: 'Assignment due date (stored as string — CAST to timestamp for date logic)',
    },
    { name: 'start_time', type: 'string', description: 'Start time of the event' },
    { name: 'end_time', type: 'string', description: 'End time of the event' },
    {
      name: 'apply_time_to_all_occurrences',
      type: 'tinyint',
      description: 'Whether the time applies to all recurrences (1=yes)',
    },
    {
      name: 'is_full_day_event',
      type: 'tinyint',
      description: 'Whether this is a full-day event (1=yes)',
    },
    { name: 'time_zone', type: 'string', description: 'Time zone of the event' },
    {
      name: 'parent_schedule_id',
      type: 'bigint',
      description: 'Parent schedule ID for recurring entries',
    },
    {
      name: 'created_by',
      type: 'bigint',
      description: 'Profile ID of the user who created the schedule entry',
    },
    {
      name: 'is_deleted',
      type: 'tinyint',
      description: 'Soft-delete flag — always filter is_deleted = 0',
    },
    {
      name: 'deleted_by',
      type: 'bigint',
      description: 'Profile ID of the user who deleted the entry',
    },
    { name: 'created_at', type: 'string', description: 'Record creation timestamp (UTC)' },
    { name: 'updated_at', type: 'string', description: 'Record last-updated timestamp (UTC)' },
    {
      name: 'calendar_view_id',
      type: 'bigint',
      description: 'Calendar view this entry belongs to',
    },
  ],
};

const noon2_core_school_calendar: AthenaTableMeta = {
  key: 'noon2_core_school_calendar',
  database: 'noon2_core',
  table: 'school_calendar',
  description:
    'Links a schedule to a course (or other entity). ' +
    "Use entity_type = 'COURSE' and entity_id = course_id to map schedules back to courses.",
  grain: '1 row = calendar (id)',
  partition: null,
  refreshCadence: 'Daily (sqooped)',
  accessLevel: 'all',
  scopeColumn: null,
  scopeType: null,
  columns: [
    {
      name: 'id',
      type: 'bigint',
      description: 'Calendar ID (PK, FK ← noon2_core.schedule.school_calendar_id)',
    },
    {
      name: 'entity_type',
      type: 'string',
      description: 'Type of entity the calendar belongs to',
      enumValues: ['COURSE'],
    },
    {
      name: 'entity_id',
      type: 'bigint',
      description: "ID of the entity — equals course_id when entity_type = 'COURSE'",
    },
    { name: 'created_by', type: 'bigint', description: 'Profile ID of the calendar creator' },
    { name: 'created_at', type: 'string', description: 'Record creation timestamp (UTC)' },
    { name: 'updated_at', type: 'string', description: 'Record last-updated timestamp (UTC)' },
  ],
};

const homework_completion_kyy: AthenaTableMeta = {
  key: 'homework_completion_kyy',
  database: 'noon2_replit',
  table: 'homework_completion_kyy',
  description:
    'CANONICAL VIEW for homework completion analysis. ' +
    'Pre-aggregates homework assignments per student per day, with completion counts already computed. ' +
    'Use this view first for any homework completion question. ' +
    'Fall back to raw joins (d_assessment → assessment_schedule → schedule → school_calendar) ' +
    "only if you need per-assignment granularity or logic this view doesn't cover. " +
    '⚠ Data starts 2026-01-18 — homework before this date is not covered. ' +
    'For per-homework granularity use the underlying view noon2_replit.kyy_hw_assigned.',
  grain:
    "1 row = user_id + subject_id + start_date (day — use DATE_TRUNC('week', start_date) to bucket by week)",
  partition: null,
  refreshCadence: 'View (computed on query)',
  accessLevel: 'all',
  scopeColumn: 'user_id',
  scopeType: 'user_id',
  columns: [
    { name: 'user_id', type: 'bigint', description: 'Student profile ID' },
    {
      name: 'subject_name',
      type: 'string',
      description: 'Subject name (display only — use subject_id for classification)',
    },
    {
      name: 'subject_id',
      type: 'bigint',
      description:
        'Subject ID (FK → noon2_core.subject.id). Qudrat IDs: 248=Quant, 249=Verbal, 250=Quant prep.',
    },
    {
      name: 'start_date',
      type: 'date',
      description:
        "Date the homework assignment window opened (DAILY grain — must DATE_TRUNC('week', start_date) to bucket by week)",
    },
    {
      name: 'total_unique_hws',
      type: 'bigint',
      description: 'Number of distinct homework assignments in that week',
    },
    {
      name: 'total_unique_hw_completed',
      type: 'bigint',
      description:
        'Number of distinct homework assignments fully completed (questions_answered = total_questions)',
    },
  ],
  exampleQueries: [
    `-- Weekly homework completion rate per student (note: start_date is daily, must DATE_TRUNC)
SELECT
    user_id,
    subject_id,
    DATE_TRUNC('week', start_date) AS week_start,
    SUM(total_unique_hws)          AS total_hws,
    SUM(total_unique_hw_completed) AS total_completed,
    ROUND(SUM(total_unique_hw_completed) * 100.0 / NULLIF(SUM(total_unique_hws), 0), 2) AS completion_rate_pct
FROM noon2_replit.homework_completion_kyy
WHERE start_date >= DATE '2026-01-18'
GROUP BY user_id, subject_id, DATE_TRUNC('week', start_date)
ORDER BY user_id, week_start`,
  ],
};

const kyy_hw_assigned: AthenaTableMeta = {
  key: 'kyy_hw_assigned',
  database: 'noon2_replit',
  table: 'kyy_hw_assigned',
  description:
    'Underlying per-homework view behind homework_completion_kyy. ' +
    'One row per student × homework assignment. Contains per-assignment completion flags. ' +
    'Use when you need row-level homework detail not available in the aggregated view. ' +
    "Tracks filter: campus_type = 'TRACKS' AND cohort_name LIKE '%ثانوي%' AND cohort_name NOT LIKE '%قدرات%' " +
    '(excludes Qudrat-only cohorts on Tracks campuses). ' +
    '⚠ Data starts 2026-01-18.',
  grain: '1 row = user_id + practice_assessment_id + hw_order',
  partition: null,
  refreshCadence: 'View (computed on query)',
  accessLevel: 'all',
  scopeColumn: 'user_id',
  scopeType: 'user_id',
  columns: [
    { name: 'user_id', type: 'bigint', description: 'Student profile ID' },
    {
      name: 'campus_type',
      type: 'string',
      description:
        'Campus type. ⚠ Uses UFUQ (single F) — different from d_user which uses UFFUQ (double F). Values: TRACKS, UFUQ.',
    },
    { name: 'campus_id', type: 'bigint', description: 'Campus ID' },
    { name: 'campus_name', type: 'string', description: 'Campus name' },
    { name: 'subject_id', type: 'bigint', description: 'Subject ID (FK → noon2_core.subject.id)' },
    { name: 'subject_name', type: 'string', description: 'Subject name (display only)' },
    {
      name: 'practice_assessment_id',
      type: 'string',
      description: 'Homework assessment ID (FK → d_assessment)',
    },
    { name: 'homework_title', type: 'string', description: 'Title of the homework assignment' },
    { name: 'total_questions', type: 'bigint', description: 'Total questions in the homework' },
    { name: 'course_id', type: 'bigint', description: 'Course ID the homework was assigned to' },
    {
      name: 'start_date',
      type: 'timestamp',
      description: 'Assignment start date (when homework opens)',
    },
    { name: 'end_date', type: 'timestamp', description: 'Assignment due date' },
    {
      name: 'hw_order',
      type: 'int',
      description:
        'Row number within the same homework per student (deduplicate with hw_order = 1)',
    },
    {
      name: 'questions_answered',
      type: 'bigint',
      description: 'Number of questions the student answered',
    },
    {
      name: 'Hw_start_date',
      type: 'timestamp',
      description: 'When the student first started the homework',
    },
    {
      name: 'HW_finish_date',
      type: 'timestamp',
      description: 'When the student finished (or last answered)',
    },
    {
      name: 'completed_same_day_assigned',
      type: 'int',
      description: '1 if completed on the same day as start_date',
    },
    { name: 'hw_completed', type: 'int', description: '1 if questions_answered = total_questions' },
    {
      name: 'hw_completed_on_time',
      type: 'int',
      description: '1 if completed and finished before or on due date',
    },
    {
      name: 'hw_completed_late',
      type: 'int',
      description: '1 if completed but finished after due date',
    },
    { name: 'hw_completed_before', type: 'int', description: '1 if completed before start_date' },
    {
      name: 'hw_incompleted',
      type: 'int',
      description: '1 if partially answered (0 < questions_answered < total_questions)',
    },
    { name: 'hw_never_attempted', type: 'int', description: '1 if questions_answered = 0' },
  ],
  exampleQueries: [
    `-- Per-homework completion detail for Tracks students (canonical Tracks filter)
SELECT user_id, practice_assessment_id, start_date, end_date,
       hw_completed, hw_completed_on_time, hw_completed_late, hw_never_attempted
FROM noon2_replit.kyy_hw_assigned
WHERE campus_type = 'TRACKS'
  AND hw_order = 1          -- deduplicate: take the earliest schedule row per hw per student
  AND start_date >= TIMESTAMP '2026-01-18'`,
  ],
};

const prediction: AthenaTableMeta = {
  key: 'prediction',
  database: 'noon2_core',
  table: 'prediction',
  description:
    'ML model predictions per user profile for TOPIC and CHAPTER entities. ' +
    'Each row represents a predicted score (prediction_value) with a 95% confidence interval ' +
    'for a given profile + entity combination on a specific as_of_date. ' +
    'Sqooped daily from the noon2_core production database.',
  grain: '1 row = profile_id + entity_type + entity_id + as_of_date',
  partition: null,
  refreshCadence: 'Daily (sqooped)',
  accessLevel: 'all',
  scopeColumn: 'profile_id',
  scopeType: 'user_id',
  columns: [
    { name: 'id', type: 'bigint', description: 'Surrogate primary key' },
    {
      name: 'prediction_run_id',
      type: 'bigint',
      description: 'ID of the model run that produced this prediction',
    },
    {
      name: 'profile_id',
      type: 'bigint',
      description: 'User profile ID (equivalent to user_id in datamart tables)',
    },
    {
      name: 'entity_type',
      type: 'string',
      description: 'Type of entity being predicted for',
      enumValues: ['TOPIC', 'CHAPTER'],
    },
    {
      name: 'entity_id',
      type: 'bigint',
      description: 'ID of the entity (topic_id or chapter_id depending on entity_type)',
    },
    {
      name: 'as_of_date',
      type: 'string',
      description: 'Date the prediction is valid for (YYYY-MM-DD)',
    },
    {
      name: 'prediction_value',
      type: 'double',
      description:
        'Predicted score/probability for the profile on this entity. Tile thresholds: Quant red < 0.4, green > 0.65812; Verbal red < 0.55, green > 0.80812. q_mean = 0.108120.',
    },
    { name: 'ci_lower', type: 'double', description: 'Lower bound of the 95% confidence interval' },
    { name: 'ci_upper', type: 'double', description: 'Upper bound of the 95% confidence interval' },
    {
      name: 'created_at',
      type: 'string',
      description: 'When this prediction record was created (UTC)',
    },
    {
      name: 'updated_at',
      type: 'string',
      description: 'When this prediction record was last updated (UTC)',
    },
  ],
  exampleQueries: [
    `-- Predictions with full content hierarchy (subject → chapter → topic) for xgboost CRON runs
SELECT
    p.as_of_date,
    p.profile_id,
    p.entity_id,
    p.entity_type,
    s.id AS subject_id,
    COALESCE(c_direct.id, c_topic.id) AS chapter_id,
    t.id AS topic_id,
    s.name AS subject_name,
    COALESCE(c_direct.name, c_topic.name) AS chapter_name,
    t.name AS topic_name,
    p.prediction_value,
    p.ci_lower,
    p.ci_upper,
    pr.model_id
FROM noon2_core.prediction p
INNER JOIN noon2_core.prediction_run pr
    ON p.prediction_run_id = pr.id
    AND pr.trigger_type = 'CRON'
LEFT JOIN noon2_core.chapter c_direct
    ON p.entity_id = c_direct.id
    AND p.entity_type = 'CHAPTER'
    AND c_direct.is_deleted = 0
LEFT JOIN noon2_core.topic t
    ON p.entity_id = t.id
    AND p.entity_type = 'TOPIC'
    AND t.is_deleted = 0
LEFT JOIN noon2_core.chapter c_topic
    ON t.chapter_id = c_topic.id
    AND p.entity_type = 'TOPIC'
    AND c_topic.is_deleted = 0
LEFT JOIN noon2_core.subject s
    ON s.id = COALESCE(c_topic.subject_id, c_direct.subject_id)
    AND s.is_deleted = 0
WHERE pr.model_id = 'xgboost'`,
  ],
};

const prediction_run: AthenaTableMeta = {
  key: 'prediction_run',
  database: 'noon2_core',
  table: 'prediction_run',
  description:
    'Metadata for each ML model prediction run. ' +
    'Each row is one execution of the prediction model for a given as_of_date, model, and requester. ' +
    'Join to prediction via prediction_run_id. ' +
    "Filter trigger_type='CRON' for scheduled runs; status='SUCCEEDED' for completed runs.",
  grain: '1 row = prediction run (id)',
  partition: null,
  refreshCadence: 'Daily (sqooped)',
  accessLevel: 'all',
  scopeColumn: null,
  scopeType: null,
  columns: [
    {
      name: 'id',
      type: 'bigint',
      description: 'Prediction run ID (PK, FK ← prediction.prediction_run_id)',
    },
    {
      name: 'trigger_type',
      type: 'string',
      description: 'What triggered the run',
      enumValues: ['CRON', 'MANUAL'],
    },
    {
      name: 'purpose',
      type: 'string',
      description: "Human-readable purpose label describing the run's intent",
      enumValues: [
        'Smart practice',
        'Daily auto for all students (valid chapters)',
        'Daily auto for all students (valid chapters/topics)',
        'Manual backfill/upsert',
      ],
    },
    {
      name: 'requester_id',
      type: 'bigint',
      description: 'Profile ID of the user who triggered a MANUAL run (NULL for CRON)',
    },
    {
      name: 'as_of_date',
      type: 'string',
      description: 'Date the predictions in this run are valid for (YYYY-MM-DD)',
    },
    {
      name: 'model_id',
      type: 'string',
      description: "Model used for the run (e.g. 'xgboost', 'bayesian')",
    },
    {
      name: 'status',
      type: 'string',
      description: 'Run outcome',
      enumValues: ['SUCCEEDED', 'FAILED', 'PARTIAL'],
    },
    { name: 'started_at', type: 'string', description: 'When the run started (UTC)' },
    { name: 'finished_at', type: 'string', description: 'When the run finished (UTC)' },
    { name: 'created_at', type: 'string', description: 'When the run record was created (UTC)' },
  ],
  exampleQueries: [
    `-- All successful CRON runs for xgboost
SELECT id, as_of_date, model_id, started_at FROM noon2_core.prediction_run
WHERE trigger_type = 'CRON' AND model_id = 'xgboost' AND status = 'SUCCEEDED'
ORDER BY as_of_date DESC`,
  ],
};

const noon2_core_subject: AthenaTableMeta = {
  key: 'noon2_core_subject',
  database: 'noon2_core',
  table: 'subject',
  description:
    'Reference table of all subjects (e.g. Chemistry, Physics, Biology). ' +
    'Sqooped from noon2_core production MySQL. Filter is_deleted=0 for active subjects. ' +
    'Canonical Qudrat IDs: 248=الجزء الكمي (Quant), 249=الجزء اللفظي (Verbal), 250=التأسيس المكثف للقدرات -كمي (Quant prep).',
  grain: '1 row = subject (id)',
  partition: null,
  refreshCadence: 'Daily (sqooped)',
  accessLevel: 'all',
  scopeColumn: null,
  scopeType: null,
  columns: [
    { name: 'id', type: 'bigint', description: 'Subject ID (PK)' },
    {
      name: 'name',
      type: 'string',
      description:
        "Subject display name (e.g. 'Chemistry', 'Physics'). Display only — use id for classification, not name.",
    },
    {
      name: 'learning_goal_id',
      type: 'bigint',
      description: 'Learning goal this subject belongs to',
    },
    {
      name: 'unused_board_id',
      type: 'bigint',
      description: 'Legacy board ID — unused, always NULL',
    },
    { name: 'image_uri', type: 'string', description: "CDN URL of the subject's cover image" },
    { name: 'is_deleted', type: 'tinyint', description: 'Soft-delete flag (0=active, 1=deleted)' },
    {
      name: 'color',
      type: 'string',
      description: "Hex colour code used in the UI (e.g. '#A36182')",
    },
    { name: 'created_at', type: 'string', description: 'Record creation timestamp (UTC)' },
    { name: 'updated_at', type: 'string', description: 'Record last-updated timestamp (UTC)' },
  ],
  exampleQueries: [
    `-- All active subjects
SELECT id, name, color FROM noon2_core.subject WHERE is_deleted = 0`,
  ],
};

const noon2_core_topic: AthenaTableMeta = {
  key: 'noon2_core_topic',
  database: 'noon2_core',
  table: 'topic',
  description:
    'All topics within chapters. Topics are the finest-grained content unit. ' +
    'Sqooped from noon2_core production MySQL. Filter is_deleted=0 for active topics.',
  grain: '1 row = topic (id)',
  partition: null,
  refreshCadence: 'Daily (sqooped)',
  accessLevel: 'all',
  scopeColumn: null,
  scopeType: null,
  columns: [
    { name: 'id', type: 'bigint', description: 'Topic ID (PK)' },
    {
      name: 'name',
      type: 'string',
      description: "Topic display name (e.g. 'Introduction to Biology')",
    },
    {
      name: 'chapter_id',
      type: 'bigint',
      description: 'Chapter this topic belongs to (FK → noon2_core.chapter.id)',
    },
    {
      name: 'sequence_number',
      type: 'bigint',
      description: 'Ordering of the topic within its chapter',
    },
    { name: 'is_deleted', type: 'tinyint', description: 'Soft-delete flag (0=active, 1=deleted)' },
    { name: 'created_at', type: 'string', description: 'Record creation timestamp (UTC)' },
    { name: 'updated_at', type: 'string', description: 'Record last-updated timestamp (UTC)' },
  ],
  exampleQueries: [
    `-- All active topics for a chapter
SELECT id, name, sequence_number FROM noon2_core.topic WHERE chapter_id = 2 AND is_deleted = 0 ORDER BY sequence_number`,
  ],
};

const noon2_core_chapter: AthenaTableMeta = {
  key: 'noon2_core_chapter',
  database: 'noon2_core',
  table: 'chapter',
  description:
    'All chapters within subjects. Chapters sit between subject and topic in the content hierarchy. ' +
    'Sqooped from noon2_core production MySQL. Filter is_deleted=0 for active chapters.',
  grain: '1 row = chapter (id)',
  partition: null,
  refreshCadence: 'Daily (sqooped)',
  accessLevel: 'all',
  scopeColumn: null,
  scopeType: null,
  columns: [
    { name: 'id', type: 'bigint', description: 'Chapter ID (PK)' },
    {
      name: 'name',
      type: 'string',
      description: "Chapter display name (e.g. 'Fundamentals of chemistry')",
    },
    {
      name: 'subject_id',
      type: 'bigint',
      description: 'Subject this chapter belongs to (FK → noon2_core.subject.id)',
    },
    {
      name: 'sequence_number',
      type: 'bigint',
      description: 'Ordering of the chapter within its subject',
    },
    { name: 'is_deleted', type: 'tinyint', description: 'Soft-delete flag (0=active, 1=deleted)' },
    { name: 'created_at', type: 'string', description: 'Record creation timestamp (UTC)' },
    { name: 'updated_at', type: 'string', description: 'Record last-updated timestamp (UTC)' },
    {
      name: 'is_suitable_for_practice',
      type: 'tinyint',
      description: 'Whether this chapter can be used for practice/assessment (1=yes, 0=no)',
    },
  ],
  exampleQueries: [
    `-- All active chapters for a subject
SELECT id, name, sequence_number FROM noon2_core.chapter WHERE subject_id = 15 AND is_deleted = 0 ORDER BY sequence_number`,
    `-- Full hierarchy: subject → chapter → topic
SELECT s.name AS subject, c.name AS chapter, t.name AS topic
FROM noon2_core.subject s
JOIN noon2_core.chapter c ON c.subject_id = s.id
JOIN noon2_core.topic t ON t.chapter_id = c.id
WHERE s.is_deleted = 0 AND c.is_deleted = 0 AND t.is_deleted = 0
ORDER BY s.name, c.sequence_number, t.sequence_number`,
  ],
};

const noon2_core_room: AthenaTableMeta = {
  key: 'noon2_core_room',
  database: 'noon2_core',
  table: 'room',
  description:
    'Room entries for sessions. Each session has one or more rooms (main room + breakout rooms). Use to bridge f_classroom_events (which has actedupon_room_id but no course_session_id) back to sessions.',
  grain: 'room_id',
  partition: null,
  refreshCadence: 'Every 12 hours (sqoop)',
  accessLevel: 'all',
  scopeColumn: null,
  scopeType: null,
  columns: [
    {
      name: 'room_id',
      type: 'bigint',
      description: 'Room ID (PK). FK ← f_classroom_events.actedupon_room_id',
    },
    {
      name: 'course_session_id',
      type: 'bigint',
      description: 'Course session this room belongs to (FK → f_course_session.course_session_id)',
    },
    {
      name: 'physical_classroom_id',
      type: 'bigint',
      description: 'Physical classroom ID (for in-person sessions)',
    },
    {
      name: 'profile_id',
      type: 'bigint',
      description: 'Profile ID of the room creator (usually the teacher)',
    },
    {
      name: 'room_start_time',
      type: 'string',
      description: 'Room start time (stored as string — CAST to timestamp)',
    },
    {
      name: 'room_end_time',
      type: 'string',
      description: 'Room end time (stored as string — CAST to timestamp)',
    },
    { name: 'room_token', type: 'string', description: 'Room token (internal)' },
    { name: 'created_at', type: 'string', description: 'Record creation timestamp' },
    { name: 'updated_at', type: 'string', description: 'Record update timestamp' },
    { name: 'is_active', type: 'tinyint', description: 'Active flag (1=active)' },
  ],
};

const noon2_core_question_explanation: AthenaTableMeta = {
  key: 'noon2_core_question_explanation',
  database: 'noon2_core',
  table: 'question_explanation',
  description:
    'Explanation content shown to students after answering a question. One row per question. Sqooped from noon2_core production MySQL.',
  grain: 'id',
  partition: null,
  refreshCadence: 'Daily (sqoop)',
  accessLevel: 'all',
  scopeColumn: null,
  scopeType: null,
  columns: [
    { name: 'id', type: 'bigint', description: 'Primary key' },
    { name: 'question_id', type: 'bigint', description: 'FK → d_question.question_id' },
    { name: 'content', type: 'string', description: 'Explanation text shown after answering' },
    {
      name: 'created_at',
      type: 'string',
      description: 'Record creation timestamp (VARCHAR, not timestamp)',
    },
    {
      name: 'updated_at',
      type: 'string',
      description: 'Record last-updated timestamp (VARCHAR, not timestamp)',
    },
  ],
};

// ---------------------------------------------------------------------------
// noon2_core — Survey Cluster
// ---------------------------------------------------------------------------

const noon2_core_survey_template: AthenaTableMeta = {
  key: 'noon2_core_survey_template',
  database: 'noon2_core',
  table: 'survey_template',
  description:
    'Templates defining survey types. Join to noon2_core.survey on survey_template_id to identify survey type.',
  grain: 'id',
  partition: null,
  refreshCadence: 'Daily (sqoop)',
  accessLevel: 'all',
  scopeColumn: null,
  scopeType: null,
  columns: [
    {
      name: 'id',
      type: 'bigint',
      description: 'Survey template ID (PK). FK ← noon2_core.survey.survey_template_id',
    },
    { name: 'title', type: 'string', description: 'Display title of the template' },
    { name: 'description', type: 'string', description: 'Description of the template' },
    {
      name: 'survey_type',
      type: 'string',
      description: 'Survey type.',
      enumValues: [
        'FACILITATOR_END_LM_SURVEY',
        'TEACHER_REPORT_ISSUE',
        'TRACK_NPS',
        'UFFUQ_DEVICE_SURVEY',
      ],
    },
    { name: 'created_by', type: 'bigint', description: 'Profile ID of the creator' },
    {
      name: 'created_at',
      type: 'string',
      description: 'Record creation timestamp (VARCHAR, not timestamp)',
    },
    {
      name: 'updated_at',
      type: 'string',
      description: 'Record last-updated timestamp (VARCHAR, not timestamp)',
    },
  ],
};

const noon2_core_survey: AthenaTableMeta = {
  key: 'noon2_core_survey',
  database: 'noon2_core',
  table: 'survey',
  description:
    'Survey instances linked to a course session. Bridges to f_course_session on course_session_id. ⚠ created_by is the session/system creator, NOT the respondent — use survey_answer.profile_id for respondent.',
  grain: 'id',
  partition: null,
  refreshCadence: 'Daily (sqoop)',
  accessLevel: 'all',
  scopeColumn: null,
  scopeType: null,
  columns: [
    {
      name: 'id',
      type: 'bigint',
      description: 'Survey instance ID (PK). FK ← noon2_core.survey_answer.survey_id',
    },
    {
      name: 'course_session_id',
      type: 'bigint',
      description: 'FK → f_course_session.course_session_id',
    },
    {
      name: 'survey_template_id',
      type: 'bigint',
      description: 'FK → noon2_core.survey_template.id',
    },
    {
      name: 'physical_room_id',
      type: 'bigint',
      description: 'Physical room ID (for in-person sessions)',
    },
    {
      name: 'end_time_cutoff',
      type: 'int',
      description: 'End time cutoff in minutes after session end',
    },
    {
      name: 'survey_date',
      type: 'string',
      description: 'Date of the survey (VARCHAR, not timestamp)',
    },
    {
      name: 'created_by',
      type: 'bigint',
      description: 'Profile ID that created the survey — NOT the respondent',
    },
    {
      name: 'created_at',
      type: 'string',
      description: 'Record creation timestamp (VARCHAR, not timestamp)',
    },
    {
      name: 'updated_at',
      type: 'string',
      description: 'Record last-updated timestamp (VARCHAR, not timestamp)',
    },
  ],
};

const noon2_core_survey_question: AthenaTableMeta = {
  key: 'noon2_core_survey_question',
  database: 'noon2_core',
  table: 'survey_question',
  description:
    "Questions belonging to a survey template. ⚠ The message field may contain i18n translation keys (e.g. 'survey.question.nps'), not rendered text. Use question_key to identify questions programmatically.",
  grain: 'id',
  partition: null,
  refreshCadence: 'Daily (sqoop)',
  accessLevel: 'all',
  scopeColumn: null,
  scopeType: null,
  columns: [
    {
      name: 'id',
      type: 'bigint',
      description: 'Survey question ID (PK). FK ← noon2_core.survey_answer.question_id',
    },
    {
      name: 'survey_template_id',
      type: 'bigint',
      description: 'FK → noon2_core.survey_template.id',
    },
    {
      name: 'message',
      type: 'string',
      description: 'Question text. ⚠ May contain i18n keys, not rendered text.',
    },
    {
      name: 'question_key',
      type: 'string',
      description: 'Programmatic key identifying the question within the template',
    },
    { name: 'question_type', type: 'string', description: 'Type of question (e.g. choice, open)' },
    { name: 'description', type: 'string', description: 'Optional subtitle for the question' },
    { name: 'sequence_number', type: 'int', description: 'Display order within the template' },
    { name: 'active', type: 'tinyint', description: 'Whether this question is active (1=yes)' },
    {
      name: 'comment_required',
      type: 'tinyint',
      description: 'Whether a comment is required (1=yes)',
    },
    {
      name: 'read_only',
      type: 'tinyint',
      description: 'Whether the question is read-only (1=yes)',
    },
    { name: 'created_by', type: 'bigint', description: 'Profile ID of the creator' },
    {
      name: 'created_at',
      type: 'string',
      description: 'Record creation timestamp (VARCHAR, not timestamp)',
    },
    {
      name: 'updated_at',
      type: 'string',
      description: 'Record last-updated timestamp (VARCHAR, not timestamp)',
    },
  ],
};

const noon2_core_survey_question_choice: AthenaTableMeta = {
  key: 'noon2_core_survey_question_choice',
  database: 'noon2_core',
  table: 'survey_question_choice',
  description:
    'Answer choices for survey questions. The choice field contains the machine-readable value (e.g. LOVED, CONFUSED); title is the display label.',
  grain: 'id',
  partition: null,
  refreshCadence: 'Daily (sqoop)',
  accessLevel: 'all',
  scopeColumn: null,
  scopeType: null,
  columns: [
    {
      name: 'id',
      type: 'bigint',
      description: 'Choice ID (PK). FK ← noon2_core.survey_answer.choice_id',
    },
    { name: 'question_id', type: 'bigint', description: 'FK → noon2_core.survey_question.id' },
    {
      name: 'choice',
      type: 'string',
      description: 'Machine-readable choice value (e.g. LOVED, CONFUSED, STRONGER, SAD)',
    },
    { name: 'title', type: 'string', description: 'Display label for the choice' },
    {
      name: 'content',
      type: 'string',
      description: 'Additional content or description for the choice',
    },
    { name: 'icon', type: 'string', description: 'Icon URI' },
    { name: 'disabled_icon', type: 'string', description: 'Icon URI when disabled' },
    { name: 'sequence_number', type: 'bigint', description: 'Display order within the question' },
    {
      name: 'comment_required',
      type: 'tinyint',
      description: 'Whether selecting this choice requires a comment (1=yes)',
    },
    { name: 'created_by', type: 'bigint', description: 'Profile ID of the creator' },
    {
      name: 'created_at',
      type: 'string',
      description: 'Record creation timestamp (VARCHAR, not timestamp)',
    },
    {
      name: 'updated_at',
      type: 'string',
      description: 'Record last-updated timestamp (VARCHAR, not timestamp)',
    },
  ],
};

const noon2_core_survey_answer: AthenaTableMeta = {
  key: 'noon2_core_survey_answer',
  database: 'noon2_core',
  table: 'survey_answer',
  description:
    'Individual survey responses. Each row is one question answered by one respondent in one survey instance. ⚠ profile_id is the respondent — NOT survey.created_by.',
  grain: 'id',
  partition: null,
  refreshCadence: 'Daily (sqoop)',
  accessLevel: 'all',
  scopeColumn: 'profile_id',
  scopeType: 'user_id',
  columns: [
    { name: 'id', type: 'bigint', description: 'Answer ID (PK)' },
    { name: 'survey_id', type: 'bigint', description: 'FK → noon2_core.survey.id' },
    {
      name: 'profile_id',
      type: 'bigint',
      description:
        'Profile ID of the respondent (= user_id in datamart). ⚠ This is the respondent, NOT survey.created_by.',
    },
    { name: 'question_id', type: 'bigint', description: 'FK → noon2_core.survey_question.id' },
    {
      name: 'choice_id',
      type: 'bigint',
      description: 'FK → noon2_core.survey_question_choice.id. NULL for open-text responses.',
    },
    { name: 'comment', type: 'string', description: 'Open-text comment from the respondent' },
    {
      name: 'created_at',
      type: 'string',
      description: 'Record creation timestamp (VARCHAR, not timestamp)',
    },
    {
      name: 'updated_at',
      type: 'string',
      description: 'Record last-updated timestamp (VARCHAR, not timestamp)',
    },
  ],
};

// ---------------------------------------------------------------------------
// noon2_core — Facilitator Cluster
// ---------------------------------------------------------------------------

const noon2_core_notes: AthenaTableMeta = {
  key: 'noon2_core_notes',
  database: 'noon2_core',
  table: 'notes',
  description:
    'Raw facilitator notes. Used for EOD reports, one-on-ones, and session health metrics. ⚠ created_at is VARCHAR. Prefer f_user_note in noon2_datamart for the enriched version. Join to noon2_core.note_task_mapping to link to task instances.',
  grain: 'id',
  partition: null,
  refreshCadence: 'Daily (sqoop)',
  accessLevel: 'all',
  scopeColumn: null,
  scopeType: null,
  columns: [
    {
      name: 'id',
      type: 'bigint',
      description: 'Note ID (PK). FK ← noon2_core.note_task_mapping.note_id',
    },
    { name: 'text', type: 'string', description: 'Note content/body' },
    {
      name: 'note_type',
      type: 'string',
      description: 'Note type.',
      enumValues: ['GENERAL_STUDENT_NOTE', 'ONE_ON_ONE_NOTE', 'TASK_NOTE'],
    },
    {
      name: 'created_by',
      type: 'bigint',
      description: 'Profile ID of the author (facilitator/supervisor)',
    },
    {
      name: 'created_at',
      type: 'string',
      description:
        'Note creation timestamp (VARCHAR, not timestamp). ⚠ CAST to timestamp for date comparisons.',
    },
    {
      name: 'updated_at',
      type: 'string',
      description: 'Last update timestamp (VARCHAR, not timestamp)',
    },
  ],
};

const noon2_core_note_task_mapping: AthenaTableMeta = {
  key: 'noon2_core_note_task_mapping',
  database: 'noon2_core',
  table: 'note_task_mapping',
  description:
    'Bridge table linking facilitator notes to task instances. Use to find which task a note was written for.',
  grain: 'id',
  partition: null,
  refreshCadence: 'Daily (sqoop)',
  accessLevel: 'all',
  scopeColumn: null,
  scopeType: null,
  columns: [
    { name: 'id', type: 'bigint', description: 'Mapping ID (PK)' },
    { name: 'note_id', type: 'bigint', description: 'FK → noon2_core.notes.id' },
    { name: 'task_id', type: 'bigint', description: 'FK → noon2_core.task_instance.id' },
  ],
};

const noon2_core_task_templates: AthenaTableMeta = {
  key: 'noon2_core_task_templates',
  database: 'noon2_core',
  table: 'task_templates',
  description:
    'Templates defining recurring facilitator tasks (e.g. EOD report, session health check). Each template generates task_instance rows for assigned facilitators. Filter is_deleted=0 for active templates.',
  grain: 'id',
  partition: null,
  refreshCadence: 'Daily (sqoop)',
  accessLevel: 'all',
  scopeColumn: null,
  scopeType: null,
  columns: [
    {
      name: 'id',
      type: 'bigint',
      description: 'Task template ID (PK). FK ← noon2_core.task_instance.task_template_id',
    },
    { name: 'title', type: 'string', description: 'Title of the task template' },
    { name: 'description', type: 'string', description: 'Description of the task' },
    { name: 'task_template_type', type: 'string', description: 'Type of task (e.g. NOTE, SURVEY)' },
    { name: 'frequency', type: 'string', description: 'Recurrence frequency (e.g. DAILY, WEEKLY)' },
    {
      name: 'task_template_trigger',
      type: 'string',
      description: 'What triggers instance creation (e.g. COURSE_SESSION)',
    },
    { name: 'start_date', type: 'string', description: 'Template active from this date (VARCHAR)' },
    { name: 'end_date', type: 'string', description: 'Template active until this date (VARCHAR)' },
    {
      name: 'visibility_start_time',
      type: 'string',
      description: 'Time the task becomes visible to facilitators (VARCHAR)',
    },
    {
      name: 'visibility_end_time',
      type: 'string',
      description: 'Time the task expires for facilitators (VARCHAR)',
    },
    {
      name: 'task_template_timezone',
      type: 'string',
      description: 'Timezone for visibility window',
    },
    {
      name: 'all_campuses',
      type: 'tinyint',
      description: 'Whether this applies to all campuses (1=yes)',
    },
    { name: 'is_deleted', type: 'tinyint', description: 'Soft-delete flag (0=active, 1=deleted)' },
    { name: 'created_by', type: 'bigint', description: 'Profile ID of the creator' },
    {
      name: 'created_at',
      type: 'string',
      description: 'Record creation timestamp (VARCHAR, not timestamp)',
    },
    {
      name: 'updated_at',
      type: 'string',
      description: 'Record last-updated timestamp (VARCHAR, not timestamp)',
    },
  ],
};

const noon2_core_task_instance: AthenaTableMeta = {
  key: 'noon2_core_task_instance',
  database: 'noon2_core',
  table: 'task_instance',
  description:
    'Individual task assignments generated from task_templates for specific facilitators. Each row is one task due on a specific date. The meta field is a JSON string with context (e.g. course_session_id). Join to noon2_core.note_task_mapping to find associated notes.',
  grain: 'id',
  partition: null,
  refreshCadence: 'Daily (sqoop)',
  accessLevel: 'all',
  scopeColumn: 'profile_id',
  scopeType: 'user_id',
  columns: [
    {
      name: 'id',
      type: 'bigint',
      description: 'Task instance ID (PK). FK ← noon2_core.note_task_mapping.task_id',
    },
    { name: 'task_template_id', type: 'bigint', description: 'FK → noon2_core.task_templates.id' },
    {
      name: 'profile_id',
      type: 'bigint',
      description: 'Facilitator assigned this task (= user_id in datamart)',
    },
    {
      name: 'task_date',
      type: 'string',
      description: 'Date the task is due (VARCHAR — CAST to date for comparisons)',
    },
    { name: 'starts_at', type: 'string', description: 'When the task becomes visible (VARCHAR)' },
    { name: 'deadline', type: 'string', description: 'Task deadline (VARCHAR)' },
    {
      name: 'status',
      type: 'string',
      description: 'Completion status.',
      enumValues: ['COMPLETED', 'EXPIRED', 'PENDING'],
    },
    {
      name: 'meta',
      type: 'string',
      description:
        'JSON string with task context (e.g. course_session_id, campus_id). Use json_extract_scalar to access fields.',
    },
    {
      name: 'completed_at',
      type: 'string',
      description: 'When the task was completed (VARCHAR). NULL if not completed.',
    },
    {
      name: 'created_at',
      type: 'string',
      description: 'Record creation timestamp (VARCHAR, not timestamp)',
    },
    {
      name: 'updated_at',
      type: 'string',
      description: 'Record last-updated timestamp (VARCHAR, not timestamp)',
    },
  ],
};

// ---------------------------------------------------------------------------
// noon2_core — ODM Cluster
// ---------------------------------------------------------------------------

const noon2_core_on_demand_session: AthenaTableMeta = {
  key: 'noon2_core_on_demand_session',
  database: 'noon2_core',
  table: 'on_demand_session',
  description:
    "Container for a student's ODM session. One on_demand_session can have multiple on_demand_mastery_session rows (one per chapter/practice combination). Join to on_demand_mastery_session on id = on_demand_session_id.",
  grain: 'id',
  partition: null,
  refreshCadence: 'Daily (sqoop)',
  accessLevel: 'all',
  scopeColumn: 'profile_id',
  scopeType: 'user_id',
  columns: [
    {
      name: 'id',
      type: 'bigint',
      description:
        'On-demand session ID (PK). FK ← noon2_core.on_demand_mastery_session.on_demand_session_id',
    },
    {
      name: 'profile_id',
      type: 'bigint',
      description: 'Student profile ID (= user_id in datamart)',
    },
    {
      name: 'created_at',
      type: 'string',
      description: 'Session start time (VARCHAR, not timestamp)',
    },
  ],
};

const noon2_core_on_demand_mastery_session: AthenaTableMeta = {
  key: 'noon2_core_on_demand_mastery_session',
  database: 'noon2_core',
  table: 'on_demand_mastery_session',
  description:
    'Each ODM practice attempt within an on_demand_session. One row per chapter/evaluation combination. The source field is the origin of is_heatmap=1 in f_user_poll. Join to mastery_question for question-level results.',
  grain: 'id',
  partition: null,
  refreshCadence: 'Daily (sqoop)',
  accessLevel: 'all',
  scopeColumn: null,
  scopeType: null,
  columns: [
    {
      name: 'id',
      type: 'bigint',
      description:
        'ODM mastery session ID (PK). FK ← noon2_core.mastery_question.on_demand_mastery_session_id. Equivalent to on_demand_session_id in f_user_poll.',
    },
    {
      name: 'on_demand_session_id',
      type: 'bigint',
      description: 'FK → noon2_core.on_demand_session.id',
    },
    { name: 'course_id', type: 'bigint', description: 'Course the practice is linked to' },
    { name: 'chapter_id', type: 'bigint', description: 'Chapter being practiced' },
    {
      name: 'session_id',
      type: 'bigint',
      description: 'Course session ID if triggered from a live session',
    },
    {
      name: 'practice_type',
      type: 'string',
      description: 'Type of practice.',
      enumValues: ['CUSTOM'],
    },
    {
      name: 'source',
      type: 'string',
      description:
        "What triggered this practice. 'Heatmap' = started from a heatmap tile (source of is_heatmap=1 in f_user_poll).",
      enumValues: ['Heatmap'],
    },
    {
      name: 'assessment_id',
      type: 'string',
      description: 'Assessment ID if linked to an assessment',
    },
    {
      name: 'evaluation_id',
      type: 'string',
      description: 'Evaluation ID (FK → f_user_poll.evaluation_id for ODM revision)',
    },
    { name: 'custom_practice_id', type: 'bigint', description: 'Custom practice ID if applicable' },
    {
      name: 'challenge_mode_practice_id',
      type: 'string',
      description: 'Challenge mode practice ID if applicable',
    },
    {
      name: 'created_at',
      type: 'string',
      description: 'Record creation timestamp (VARCHAR, not timestamp)',
    },
  ],
};

const noon2_core_mastery_question: AthenaTableMeta = {
  key: 'noon2_core_mastery_question',
  database: 'noon2_core',
  table: 'mastery_question',
  description:
    'Question-level results for each ODM mastery session. Each row is one question shown to a student. Use for per-question accuracy and timing analysis of ODM practice.',
  grain: 'id',
  partition: null,
  refreshCadence: 'Daily (sqoop)',
  accessLevel: 'all',
  scopeColumn: null,
  scopeType: null,
  columns: [
    { name: 'id', type: 'bigint', description: 'Mastery question record ID (PK)' },
    {
      name: 'on_demand_mastery_session_id',
      type: 'bigint',
      description: 'FK → noon2_core.on_demand_mastery_session.id',
    },
    { name: 'question_id', type: 'bigint', description: 'FK → d_question.question_id' },
    {
      name: 'submitted_choice_id',
      type: 'bigint',
      description: 'Choice the student selected. NULL if not answered.',
    },
    {
      name: 'is_correct',
      type: 'tinyint',
      description: '1 if correct, 0 if wrong, NULL if not answered',
    },
    { name: 'attempt_count', type: 'bigint', description: 'Number of attempts on this question' },
    {
      name: 'displayed_at',
      type: 'string',
      description: 'When the question was shown (VARCHAR, not timestamp)',
    },
    {
      name: 'answered_at',
      type: 'string',
      description: 'When the student answered (VARCHAR, not timestamp)',
    },
  ],
};

// ---------------------------------------------------------------------------
// noon2_core — Reference Tables
// ---------------------------------------------------------------------------

const noon2_core_choice: AthenaTableMeta = {
  key: 'noon2_core_choice',
  database: 'noon2_core',
  table: 'choice',
  description:
    'All answer choices for questions in the question bank. Filter is_deleted=0 for active choices. Join to d_question on question_id. The text field contains displayed answer text.',
  grain: 'id',
  partition: null,
  refreshCadence: 'Daily (sqoop)',
  accessLevel: 'all',
  scopeColumn: null,
  scopeType: null,
  columns: [
    {
      name: 'id',
      type: 'bigint',
      description:
        'Choice ID (PK). Referenced by f_user_poll.selected_choice_id, f_user_poll.correct_choice_id, noon2_core.mastery_question.submitted_choice_id',
    },
    { name: 'question_id', type: 'bigint', description: 'FK → d_question.question_id' },
    { name: 'text', type: 'string', description: 'Choice answer text displayed to the student' },
    {
      name: 'url',
      type: 'string',
      description: 'Image URL for image-based choices (NULL if text-only)',
    },
    {
      name: 'is_deleted',
      type: 'tinyint',
      description: 'Soft-delete flag (0=active, 1=deleted). Filter is_deleted=0.',
    },
    { name: 'noon1_choice_id', type: 'bigint', description: 'Legacy noon1 choice ID' },
    { name: 'is_correct_noon1', type: 'int', description: 'Legacy correctness flag from noon1' },
    {
      name: 'created_at',
      type: 'string',
      description: 'Record creation timestamp (VARCHAR, not timestamp)',
    },
    {
      name: 'updated_at',
      type: 'string',
      description: 'Record last-updated timestamp (VARCHAR, not timestamp)',
    },
  ],
};

const noon2_core_grade: AthenaTableMeta = {
  key: 'noon2_core_grade',
  database: 'noon2_core',
  table: 'grade',
  description:
    "Grade reference table. SA grade names are Arabic: 'اولى ثانوي'=G10, 'ثاني ثانوي'=G11, 'ثالث ثانوي'=G12. Filter is_deleted=0 for active grades.",
  grain: 'id',
  partition: null,
  refreshCadence: 'Daily (sqoop)',
  accessLevel: 'all',
  scopeColumn: null,
  scopeType: null,
  columns: [
    {
      name: 'id',
      type: 'bigint',
      description:
        'Grade ID (PK). Referenced by d_user.student_grade_id, d_school_student_courses.student_grade_id',
    },
    {
      name: 'name',
      type: 'string',
      description:
        "Grade name. SA names are Arabic: 'اولى ثانوي'=G10, 'ثاني ثانوي'=G11, 'ثالث ثانوي'=G12.",
    },
    { name: 'board_id', type: 'bigint', description: 'Board this grade belongs to' },
    { name: 'is_virtual_grade', type: 'tinyint', description: 'Virtual/placeholder grade (1=yes)' },
    { name: 'is_deleted', type: 'tinyint', description: 'Soft-delete flag (0=active, 1=deleted)' },
    {
      name: 'created_at',
      type: 'string',
      description: 'Record creation timestamp (VARCHAR, not timestamp)',
    },
    {
      name: 'updated_at',
      type: 'string',
      description: 'Record last-updated timestamp (VARCHAR, not timestamp)',
    },
  ],
};

const noon2_core_campus: AthenaTableMeta = {
  key: 'noon2_core_campus',
  database: 'noon2_core',
  table: 'campus',
  description:
    'Campus reference table. Use for name/type lookups. Prefer d_user.campus_type for filtering (TRACKS, UFFUQ, LABS, B2B). Filter is_deleted=0.',
  grain: 'id',
  partition: null,
  refreshCadence: 'Daily (sqoop)',
  accessLevel: 'all',
  scopeColumn: null,
  scopeType: null,
  columns: [
    {
      name: 'id',
      type: 'bigint',
      description:
        'Campus ID (PK). Referenced by d_user.campus_id, d_school_student_courses.campus_id',
    },
    { name: 'name', type: 'string', description: 'Campus display name (Arabic)' },
    { name: 'name_english', type: 'string', description: 'Campus display name (English)' },
    { name: 'type', type: 'string', description: 'Campus type (TRACKS, UFFUQ, LABS, B2B, etc.)' },
    { name: 'campus_code', type: 'string', description: 'Short campus code' },
    { name: 'short_name', type: 'string', description: 'Short display name' },
    {
      name: 'allowed_gender',
      type: 'string',
      description: 'Allowed gender.',
      enumValues: ['COED', 'FEMALE', 'MALE'],
    },
    { name: 'curriculum', type: 'string', description: 'Curriculum followed by the campus' },
    { name: 'school_level', type: 'string', description: 'School level (e.g. HIGH_SCHOOL)' },
    { name: 'country_id', type: 'int', description: 'Country ID the campus belongs to' },
    { name: 'location', type: 'string', description: 'Physical location' },
    { name: 'address', type: 'string', description: 'Physical address' },
    { name: 'is_deleted', type: 'tinyint', description: 'Soft-delete flag (0=active, 1=deleted)' },
    {
      name: 'created_at',
      type: 'string',
      description: 'Record creation timestamp (VARCHAR, not timestamp)',
    },
    {
      name: 'updated_at',
      type: 'string',
      description: 'Record last-updated timestamp (VARCHAR, not timestamp)',
    },
  ],
};

const noon2_core_campus_managers: AthenaTableMeta = {
  key: 'noon2_core_campus_managers',
  database: 'noon2_core',
  table: 'campus_managers',
  description:
    'Facilitator-to-campus assignments. Maps profile IDs (facilitators, school managers) to the campuses they manage.',
  grain: 'id',
  partition: null,
  refreshCadence: 'Daily (sqoop)',
  accessLevel: 'all',
  scopeColumn: 'profile_id',
  scopeType: 'user_id',
  columns: [
    { name: 'id', type: 'bigint', description: 'Mapping ID (PK)' },
    {
      name: 'profile_id',
      type: 'bigint',
      description: 'Facilitator or manager profile ID (= user_id in datamart)',
    },
    { name: 'campus_id', type: 'bigint', description: 'FK → noon2_core.campus.id' },
    {
      name: 'role',
      type: 'string',
      description: 'Role on this campus (e.g. FACILITATOR, SCHOOL_MANAGER)',
    },
    {
      name: 'created_at',
      type: 'string',
      description: 'Record creation timestamp (VARCHAR, not timestamp)',
    },
    {
      name: 'updated_at',
      type: 'string',
      description: 'Record last-updated timestamp (VARCHAR, not timestamp)',
    },
  ],
};

const noon2_core_profile: AthenaTableMeta = {
  key: 'noon2_core_profile',
  database: 'noon2_core',
  table: 'profile',
  description:
    'Raw profile table from noon2_core. Use as a fallback for name/type lookups or when account_id is needed. Prefer d_user for analytics — it is enriched with campus, grade, and school info.',
  grain: 'id',
  partition: null,
  refreshCadence: 'Daily (sqoop)',
  accessLevel: 'all',
  scopeColumn: 'id',
  scopeType: 'user_id',
  columns: [
    {
      name: 'id',
      type: 'bigint',
      description: 'Profile ID (PK). Equivalent to user_id in datamart tables.',
    },
    {
      name: 'account_id',
      type: 'bigint',
      description: 'Account ID (one account can have multiple profiles)',
    },
    { name: 'name', type: 'string', description: 'Profile display name' },
    { name: 'user_type', type: 'string', description: 'User type: STUDENT, TEACHER, ADMIN, etc.' },
    { name: 'gender', type: 'string', description: 'Gender.', enumValues: ['FEMALE', 'MALE'] },
    { name: 'locale', type: 'string', description: 'User locale (e.g. ar, en)' },
    { name: 'avatar_uri', type: 'string', description: 'Profile avatar URI' },
    { name: 'is_deactivated', type: 'tinyint', description: 'Whether deactivated (1=yes)' },
    { name: 'is_deleted', type: 'tinyint', description: 'Soft-delete flag (0=active, 1=deleted)' },
    { name: 'role_id', type: 'bigint', description: 'Internal permission role ID' },
    {
      name: 'screen_share_enabled',
      type: 'tinyint',
      description: 'Whether screen sharing is enabled',
    },
    { name: 'noon1_user_id', type: 'int', description: 'Legacy noon1 user ID' },
    {
      name: 'created_at',
      type: 'string',
      description: 'Profile creation timestamp (VARCHAR, not timestamp)',
    },
    {
      name: 'updated_at',
      type: 'string',
      description: 'Last update timestamp (VARCHAR, not timestamp)',
    },
  ],
};

// ---------------------------------------------------------------------------
// RAW SOURCE TABLES (noon2_core — MCQ)
// ---------------------------------------------------------------------------

const noon2_core_mcq: AthenaTableMeta = {
  key: 'noon2_core_mcq',
  database: 'noon2_core',
  table: 'mcq',
  description:
    'MCQ instances created within sessions or mastery sessions. Links a question to an activity/session context. Join to noon2_core.choice via question_id for answer options, or to mcq_selected_choice via mcq.id for student responses.',
  grain: 'id',
  partition: null,
  refreshCadence: 'Every 12 hours (sqoop)',
  accessLevel: 'all',
  scopeColumn: null,
  scopeType: null,
  columns: [
    { name: 'id', type: 'bigint', description: 'MCQ instance ID (PK)' },
    {
      name: 'activity_id',
      type: 'bigint',
      description: 'Activity ID this MCQ belongs to (FK → d_classroom_activity.activity_id)',
    },
    { name: 'course_session_id', type: 'bigint', description: 'Session ID' },
    {
      name: 'question_id',
      type: 'bigint',
      description: 'Question ID (FK → d_question.question_id)',
    },
    {
      name: 'mastery_session_id',
      type: 'bigint',
      description: 'ODM session ID if from mastery practice',
    },
    { name: 'creator_id', type: 'bigint', description: 'Profile ID of the MCQ creator' },
    { name: 'type', type: 'string', description: 'MCQ type' },
    { name: 'locale', type: 'string', description: 'Language locale' },
    {
      name: 'show_correct_answer',
      type: 'tinyint',
      description: 'Whether correct answer is shown after submission (0/1)',
    },
    {
      name: 'created_at',
      type: 'string',
      description: 'VARCHAR timestamp — CAST before comparing',
    },
    { name: 'updated_at', type: 'string', description: 'VARCHAR timestamp' },
  ],
};

const noon2_core_mcq_selected_choice: AthenaTableMeta = {
  key: 'noon2_core_mcq_selected_choice',
  database: 'noon2_core',
  table: 'mcq_selected_choice',
  description:
    'Student responses to MCQs at the raw level. One row per student per MCQ per attempt. Join to noon2_core.mcq on mcq_id, and to noon2_core.choice on choice_id for the answer text.',
  grain: 'id',
  partition: null,
  refreshCadence: 'Every 12 hours (sqoop)',
  accessLevel: 'all',
  scopeColumn: null,
  scopeType: null,
  columns: [
    { name: 'id', type: 'bigint', description: 'PK' },
    { name: 'mcq_id', type: 'bigint', description: 'FK → noon2_core.mcq.id' },
    { name: 'profile_id', type: 'bigint', description: 'Student profile ID (= user_id)' },
    {
      name: 'choice_id',
      type: 'bigint',
      description: 'FK → noon2_core.choice.id — the answer chosen',
    },
    { name: 'attempt', type: 'int', description: 'Attempt number (1-based)' },
    { name: 'is_correct', type: 'tinyint', description: 'Whether the choice was correct (0/1)' },
    { name: 'source', type: 'string', description: 'Response source' },
    { name: 'submitted_text', type: 'string', description: 'Free-text response if applicable' },
    { name: 'answered_at', type: 'string', description: 'VARCHAR timestamp when answered' },
    {
      name: 'displayed_at',
      type: 'string',
      description: 'VARCHAR timestamp when MCQ was displayed',
    },
    { name: 'created_at', type: 'string', description: 'VARCHAR timestamp' },
    { name: 'updated_at', type: 'string', description: 'VARCHAR timestamp' },
  ],
};

const noon2_core_mcq_selected_choice_choices: AthenaTableMeta = {
  key: 'noon2_core_mcq_selected_choice_choices',
  database: 'noon2_core',
  table: 'mcq_selected_choice_choices',
  description:
    'Bridge table for multi-select MCQs. Links a mcq_selected_choice to multiple choice_ids when a student selects more than one answer.',
  grain: 'mcq_selected_choice_id + choice_id',
  partition: null,
  refreshCadence: 'Every 12 hours (sqoop)',
  accessLevel: 'all',
  scopeColumn: null,
  scopeType: null,
  columns: [
    {
      name: 'mcq_selected_choice_id',
      type: 'bigint',
      description: 'FK → noon2_core.mcq_selected_choice.id',
    },
    { name: 'choice_id', type: 'bigint', description: 'FK → noon2_core.choice.id' },
  ],
};

// ---------------------------------------------------------------------------
// noon2_datamart — Activity Feature Duration
// ---------------------------------------------------------------------------

const f_user_activity_feature_duration: AthenaTableMeta = {
  key: 'f_user_activity_feature_duration',
  database: 'noon2_datamart',
  table: 'f_user_activity_feature_duration',
  description:
    'Per-user per-activity feature-level active time. Tracks how much time each student spent on each in-classroom activity feature (zoom-in, reaction, stage time, message, chat reaction, etc.). Built from MongoDB CDC room_segment_active_duration_metrics.',
  grain: 'user_id + course_session_id + session_slide_id',
  partition: 'dt',
  refreshCadence: 'Every 12 hours',
  accessLevel: 'all',
  scopeColumn: null,
  scopeType: null,
  columns: [
    { name: 'course_session_id', type: 'bigint', description: 'Session ID' },
    { name: 'course_id', type: 'bigint', description: 'Course ID' },
    { name: 'room_id', type: 'bigint', description: 'Room ID' },
    { name: 'user_id', type: 'bigint', description: 'Student profile ID' },
    { name: 'session_slide_id', type: 'bigint', description: 'Activity/slide ID' },
    { name: 'segment_id', type: 'string', description: 'Segment ID (for breakout activities)' },
    { name: 'pace', type: 'string', description: 'Activity pace' },
    {
      name: 'activity_start_mins',
      type: 'double',
      description: 'Minutes from activity start event',
    },
    { name: 'zoom_in_mins', type: 'double', description: 'Minutes spent zooming in' },
    { name: 'reaction_mins', type: 'double', description: 'Minutes spent on reactions' },
    { name: 'slide_preview_mins', type: 'double', description: 'Minutes previewing slides' },
    { name: 'stage_time_mins', type: 'double', description: 'Minutes on stage' },
    { name: 'message_mins', type: 'double', description: 'Minutes messaging' },
    { name: 'start_discussion_mins', type: 'double', description: 'Minutes in discussion' },
    { name: 'team_cheer_mins', type: 'double', description: 'Minutes on team cheers' },
    { name: 'student_cheer_mins', type: 'double', description: 'Minutes on student cheers' },
    { name: 'chat_reaction_mins', type: 'double', description: 'Minutes on chat reactions' },
    { name: 'hand_lower_mins', type: 'double', description: 'Minutes with hand raised/lowered' },
    {
      name: 'embedded_active_team_event_mins',
      type: 'double',
      description: 'Minutes on embedded team activity events',
    },
    {
      name: 'total_active_mins',
      type: 'double',
      description: 'Sum of all feature-level active minutes',
    },
    {
      name: 'n_features_used',
      type: 'int',
      description: 'Count of distinct features used during this activity',
    },
    { name: 'active_time_total_mins', type: 'double', description: 'Total active time in minutes' },
    {
      name: 'segment_total_time_mins',
      type: 'double',
      description: 'Total segment duration in minutes',
    },
    { name: 'dt', type: 'bigint', description: 'Partition column YYYYMMDD' },
  ],
};

// ---------------------------------------------------------------------------
// LESSON BUILDER MODEL (noon2_core — sqooped)
// ---------------------------------------------------------------------------
// The "Lesson" content system: a teacher authors a Lesson (optionally a reusable
// template), which is snapshotted into immutable Lesson Versions. A version holds
// ordered Segments and Activities (each activity may map to Questions), and is tagged
// with Curriculum. A Lesson Version is linked to a course session (lesson_session_link)
// and then materialized into concrete session content (lesson_session_materialization
// + _mapping). Lessons can be shared via lesson_share_link.
// ⚠ ALL id / *_id columns here are STRING (UUIDs), EXCEPT course_session_id / created_by /
//   linked_by / question_id / *curriculum FKs which are BIGINT. ⚠ All timestamps are VARCHAR
//   (TRY_CAST before comparing). Filter is_deleted = 0 for active lessons.
// ---------------------------------------------------------------------------

const noon2_core_lesson: AthenaTableMeta = {
  key: 'noon2_core_lesson',
  database: 'noon2_core',
  table: 'lesson',
  description:
    'Root of the Lesson Builder model: one row per authored lesson (a lesson plan). ' +
    'May be a reusable template (is_template=1) with a template_key/version. Published lessons ' +
    'are snapshotted into immutable noon2_core.lesson_version rows. Sqooped from noon2_core production MySQL. ' +
    'Filter is_deleted=0 for active lessons.',
  grain: '1 row = lesson (id, UUID string)',
  partition: null,
  refreshCadence: 'Daily (sqooped)',
  accessLevel: 'all',
  scopeColumn: null,
  scopeType: null,
  columns: [
    {
      name: 'id',
      type: 'string',
      description:
        'Lesson ID (PK, UUID). FK target of lesson_version.lesson_id, lesson_curriculum.lesson_id, etc.',
    },
    { name: 'name', type: 'string', description: 'Lesson display name/title' },
    {
      name: 'class_type',
      type: 'string',
      description: 'Live class type this lesson is built for',
      enumValues: ['LIVE_CLASS', 'LIVE_MASTERY'],
    },
    {
      name: 'lesson_type',
      type: 'string',
      description: 'Delivery mode of the lesson',
      enumValues: ['HYBRID', 'ONLINE'],
    },
    { name: 'duration_minutes', type: 'bigint', description: 'Planned lesson duration in minutes' },
    {
      name: 'is_template',
      type: 'tinyint',
      description: '1 = reusable template lesson, 0 = concrete lesson',
      enumValues: ['0', '1'],
    },
    {
      name: 'template_key',
      type: 'string',
      description: 'Template family key (only for templates)',
      enumValues: ['concept_coverage', 'practice', 'revision'],
    },
    {
      name: 'template_version',
      type: 'int',
      description: 'Version number of the template definition',
    },
    {
      name: 'is_published',
      type: 'tinyint',
      description: '1 = lesson has a published version, 0 = draft-only',
      enumValues: ['0', '1'],
    },
    {
      name: 'is_deleted',
      type: 'tinyint',
      description: 'Soft-delete flag (0=active, 1=deleted)',
      enumValues: ['0', '1'],
    },
    {
      name: 'created_by',
      type: 'bigint',
      description: 'Profile ID (teacher/author) who created the lesson (FK → d_user.user_id)',
    },
    {
      name: 'created_at',
      type: 'string',
      description: 'Record creation timestamp (UTC, VARCHAR — TRY_CAST to timestamp)',
    },
    {
      name: 'updated_at',
      type: 'string',
      description: 'Record last-updated timestamp (UTC, VARCHAR)',
    },
  ],
};

const noon2_core_lesson_version: AthenaTableMeta = {
  key: 'noon2_core_lesson_version',
  database: 'noon2_core',
  table: 'lesson_version',
  description:
    'Immutable versioned snapshot of a lesson. Each publish/edit produces a new version_number. ' +
    'Segments and activities hang off lesson_version_id. Sqooped from noon2_core production MySQL.',
  grain: '1 row = lesson version (id, UUID string)',
  partition: null,
  refreshCadence: 'Daily (sqooped)',
  accessLevel: 'all',
  scopeColumn: null,
  scopeType: null,
  columns: [
    {
      name: 'id',
      type: 'string',
      description:
        'Lesson version ID (PK, UUID). Referenced by lesson_activity.lesson_version_id, lesson_segment.lesson_version_id, lesson_session_link.lesson_version_id, etc.',
    },
    { name: 'lesson_id', type: 'string', description: 'Parent lesson (FK → noon2_core.lesson.id)' },
    {
      name: 'version_number',
      type: 'int',
      description: 'Monotonic version number within the lesson',
    },
    { name: 'title', type: 'string', description: 'Version title' },
    {
      name: 'status',
      type: 'string',
      description: 'Lifecycle status of this version',
      enumValues: ['ARCHIVED', 'DRAFT', 'PUBLISHED'],
    },
    {
      name: 'is_published',
      type: 'tinyint',
      description: '1 = this version is published',
      enumValues: ['0', '1'],
    },
    {
      name: 'duration_seconds',
      type: 'int',
      description: 'Total planned duration of this version in seconds',
    },
    {
      name: 'source_course_session_id',
      type: 'bigint',
      description: 'Course session this version was derived/recorded from, if any',
    },
    {
      name: 'created_by',
      type: 'bigint',
      description: 'Profile ID that created the version (FK → d_user.user_id)',
    },
    {
      name: 'created_at',
      type: 'string',
      description: 'Version creation timestamp (UTC, VARCHAR)',
    },
    {
      name: 'updated_at',
      type: 'string',
      description: 'Version last-updated timestamp (UTC, VARCHAR)',
    },
  ],
};

const noon2_core_lesson_session_link: AthenaTableMeta = {
  key: 'noon2_core_lesson_session_link',
  database: 'noon2_core',
  table: 'lesson_session_link',
  description:
    'Links a lesson version to a course session (which lesson a session is teaching). ' +
    'A link can be superseded (replaced_by_link_id) or unlinked (unlinked_at). Sqooped from noon2_core.',
  grain: '1 row = lesson↔session link (id, UUID string)',
  partition: null,
  refreshCadence: 'Daily (sqooped)',
  accessLevel: 'all',
  scopeColumn: null,
  scopeType: null,
  columns: [
    { name: 'id', type: 'string', description: 'Link ID (PK, UUID)' },
    { name: 'lesson_id', type: 'string', description: 'Lesson (FK → noon2_core.lesson.id)' },
    {
      name: 'lesson_version_id',
      type: 'string',
      description: 'Lesson version linked (FK → noon2_core.lesson_version.id)',
    },
    {
      name: 'course_session_id',
      type: 'bigint',
      description:
        'Course session the lesson is linked to (FK → f_course_session.course_session_id)',
    },
    { name: 'linked_by', type: 'bigint', description: 'Profile ID that created the link' },
    { name: 'linked_at', type: 'string', description: 'When the lesson was linked (UTC, VARCHAR)' },
    {
      name: 'unlinked_at',
      type: 'string',
      description: 'When the link was removed, if any (UTC, VARCHAR). NULL = still active',
    },
    {
      name: 'replaced_by_link_id',
      type: 'string',
      description: 'ID of the link that superseded this one, if any (FK → self)',
    },
    { name: 'created_at', type: 'string', description: 'Record creation timestamp (UTC, VARCHAR)' },
    {
      name: 'updated_at',
      type: 'string',
      description: 'Record last-updated timestamp (UTC, VARCHAR)',
    },
  ],
};

const noon2_core_lesson_activity: AthenaTableMeta = {
  key: 'noon2_core_lesson_activity',
  database: 'noon2_core',
  table: 'lesson_activity',
  description:
    'An ordered activity within a lesson version (question, marathon, team duel, exit ticket, etc.). ' +
    'Maps to a lesson slide; questions attached via lesson_activity_question. Sqooped from noon2_core.',
  grain: '1 row = lesson activity (id, UUID string)',
  partition: null,
  refreshCadence: 'Daily (sqooped)',
  accessLevel: 'all',
  scopeColumn: null,
  scopeType: null,
  columns: [
    {
      name: 'id',
      type: 'string',
      description:
        'Lesson activity ID (PK, UUID). FK target of lesson_activity_question.lesson_activity_id',
    },
    {
      name: 'lesson_version_id',
      type: 'string',
      description: 'Parent lesson version (FK → noon2_core.lesson_version.id)',
    },
    {
      name: 'activity_index',
      type: 'int',
      description: 'Ordering of the activity within the lesson version',
    },
    {
      name: 'activity_logical_id',
      type: 'string',
      description:
        "Stable logical ID that survives across versions (identifies 'the same' activity)",
    },
    { name: 'lesson_slide_id', type: 'string', description: 'Slide this activity is anchored to' },
    {
      name: 'type',
      type: 'string',
      description: 'Activity type',
      enumValues: [
        'ANNOTATION_RESPONSE',
        'BETTER_CALL_SAUL',
        'CUSTOM',
        'DRAG_AND_DROP_RESPONSE',
        'EMBEDDED',
        'EXIT_TICKET',
        'MARATHON',
        'OPEN_RESPONSE',
        'QUESTION',
        'SECTION_CHECK',
        'SQUID_GAME',
        'TEAM_DUEL',
        'TEAM_EXERCISE',
      ],
    },
    {
      name: 'marathon_config_json',
      type: 'string',
      description: 'JSON config for MARATHON-type activities (use get_json_object to parse)',
    },
    { name: 'created_at', type: 'string', description: 'Record creation timestamp (UTC, VARCHAR)' },
    {
      name: 'updated_at',
      type: 'string',
      description: 'Record last-updated timestamp (UTC, VARCHAR)',
    },
  ],
};

const noon2_core_lesson_activity_question: AthenaTableMeta = {
  key: 'noon2_core_lesson_activity_question',
  database: 'noon2_core',
  table: 'lesson_activity_question',
  description:
    'Bridge: questions assigned to a lesson activity, in order. Join question_id → d_question / noon2_core.question. ' +
    'Sqooped from noon2_core.',
  grain: '1 row = activity × question (id, UUID string)',
  partition: null,
  refreshCadence: 'Daily (sqooped)',
  accessLevel: 'all',
  scopeColumn: null,
  scopeType: null,
  columns: [
    { name: 'id', type: 'string', description: 'Row ID (PK, UUID)' },
    {
      name: 'lesson_activity_id',
      type: 'string',
      description: 'Lesson activity (FK → noon2_core.lesson_activity.id)',
    },
    {
      name: 'question_id',
      type: 'bigint',
      description: 'Question (FK → d_question.question_id / noon2_core.question.id)',
    },
    {
      name: 'question_index',
      type: 'int',
      description: 'Ordering of the question within the activity',
    },
    { name: 'created_at', type: 'string', description: 'Record creation timestamp (UTC, VARCHAR)' },
    {
      name: 'updated_at',
      type: 'string',
      description: 'Record last-updated timestamp (UTC, VARCHAR)',
    },
  ],
};

const noon2_core_lesson_curriculum: AthenaTableMeta = {
  key: 'noon2_core_lesson_curriculum',
  database: 'noon2_core',
  table: 'lesson_curriculum',
  description:
    'Curriculum tagging for a lesson: which subject/chapter/topic/subtopic/concept it covers. ' +
    'One lesson may have multiple curriculum rows. Sqooped from noon2_core.',
  grain: '1 row = lesson × curriculum node (id, UUID string)',
  partition: null,
  refreshCadence: 'Daily (sqooped)',
  accessLevel: 'all',
  scopeColumn: null,
  scopeType: null,
  columns: [
    { name: 'id', type: 'string', description: 'Row ID (PK, UUID)' },
    { name: 'lesson_id', type: 'string', description: 'Lesson (FK → noon2_core.lesson.id)' },
    {
      name: 'subject_id',
      type: 'bigint',
      description:
        'Subject (FK → noon2_core.subject.id). Qudrat IDs: 248=Quant, 249=Verbal, 250=Quant prep.',
    },
    { name: 'chapter_id', type: 'bigint', description: 'Chapter (FK → noon2_core.chapter.id)' },
    { name: 'topic_id', type: 'bigint', description: 'Topic (FK → noon2_core.topic.id)' },
    { name: 'subtopic_id', type: 'bigint', description: 'Subtopic ID, if tagged' },
    { name: 'concept_id', type: 'bigint', description: 'Concept ID, if tagged' },
    { name: 'created_at', type: 'string', description: 'Record creation timestamp (UTC, VARCHAR)' },
    {
      name: 'updated_at',
      type: 'string',
      description: 'Record last-updated timestamp (UTC, VARCHAR)',
    },
  ],
};

const noon2_core_lesson_segment: AthenaTableMeta = {
  key: 'noon2_core_lesson_segment',
  database: 'noon2_core',
  table: 'lesson_segment',
  description:
    'An ordered segment (pacing block) within a lesson version. Groups activities/slides into sections ' +
    'with a planned duration. Sqooped from noon2_core.',
  grain: '1 row = lesson segment (id, UUID string)',
  partition: null,
  refreshCadence: 'Daily (sqooped)',
  accessLevel: 'all',
  scopeColumn: null,
  scopeType: null,
  columns: [
    { name: 'id', type: 'string', description: 'Lesson segment ID (PK, UUID)' },
    {
      name: 'lesson_version_id',
      type: 'string',
      description: 'Parent lesson version (FK → noon2_core.lesson_version.id)',
    },
    { name: 'name', type: 'string', description: 'Segment name' },
    {
      name: 'segment_index',
      type: 'int',
      description: 'Ordering of the segment within the lesson version',
    },
    {
      name: 'segment_logical_id',
      type: 'string',
      description: 'Stable logical ID for the segment across versions',
    },
    { name: 'duration_seconds', type: 'int', description: 'Planned segment duration in seconds' },
    { name: 'pace', type: 'string', description: 'Pace/tempo tag for the segment' },
    { name: 'created_at', type: 'string', description: 'Record creation timestamp (UTC, VARCHAR)' },
    {
      name: 'updated_at',
      type: 'string',
      description: 'Record last-updated timestamp (UTC, VARCHAR)',
    },
  ],
};

const noon2_core_lesson_session_materialization: AthenaTableMeta = {
  key: 'noon2_core_lesson_session_materialization',
  database: 'noon2_core',
  table: 'lesson_session_materialization',
  description:
    'Tracks materialization of a linked lesson version into concrete session content (slides/activities). ' +
    'status READY = live; SUPERSEDED = replaced by a newer materialization. error_* fields populated on failure. ' +
    'Sqooped from noon2_core.',
  grain: '1 row = materialization attempt (id, UUID string)',
  partition: null,
  refreshCadence: 'Daily (sqooped)',
  accessLevel: 'all',
  scopeColumn: null,
  scopeType: null,
  columns: [
    {
      name: 'id',
      type: 'string',
      description:
        'Materialization ID (PK, UUID). Referenced by lesson_session_materialization_mapping.materialization_id',
    },
    { name: 'lesson_id', type: 'string', description: 'Lesson (FK → noon2_core.lesson.id)' },
    {
      name: 'lesson_version_id',
      type: 'string',
      description: 'Lesson version materialized (FK → noon2_core.lesson_version.id)',
    },
    {
      name: 'lesson_session_link_id',
      type: 'string',
      description: 'Originating link (FK → noon2_core.lesson_session_link.id)',
    },
    {
      name: 'course_session_id',
      type: 'bigint',
      description: 'Target course session (FK → f_course_session.course_session_id)',
    },
    {
      name: 'status',
      type: 'string',
      description: 'Materialization status',
      enumValues: ['READY', 'SUPERSEDED'],
    },
    {
      name: 'ready_at',
      type: 'string',
      description: 'When materialization completed (UTC, VARCHAR)',
    },
    {
      name: 'failed_at',
      type: 'string',
      description: 'When materialization failed, if any (UTC, VARCHAR)',
    },
    { name: 'error_code', type: 'string', description: 'Error code on failure' },
    { name: 'error_message', type: 'string', description: 'Error message on failure' },
    {
      name: 'created_by',
      type: 'bigint',
      description: 'Profile ID that triggered the materialization',
    },
    { name: 'created_at', type: 'string', description: 'Record creation timestamp (UTC, VARCHAR)' },
    {
      name: 'updated_at',
      type: 'string',
      description: 'Record last-updated timestamp (UTC, VARCHAR)',
    },
  ],
};

const noon2_core_lesson_session_materialization_mapping: AthenaTableMeta = {
  key: 'noon2_core_lesson_session_materialization_mapping',
  database: 'noon2_core',
  table: 'lesson_session_materialization_mapping',
  description:
    'Bridge produced by materialization: maps a lesson-side entity ref to the concrete session-side entity ref ' +
    'it became (kind identifies the entity type, e.g. slide/activity/question). Sqooped from noon2_core. ' +
    '⚠ Unlike the other lesson tables, id here is BIGINT.',
  grain: '1 row = lesson_ref ↔ session_ref mapping (id, bigint)',
  partition: null,
  refreshCadence: 'Daily (sqooped)',
  accessLevel: 'all',
  scopeColumn: null,
  scopeType: null,
  columns: [
    { name: 'id', type: 'bigint', description: 'Row ID (PK, bigint)' },
    {
      name: 'materialization_id',
      type: 'string',
      description: 'Materialization (FK → noon2_core.lesson_session_materialization.id)',
    },
    {
      name: 'kind',
      type: 'string',
      description: 'Type of entity being mapped (e.g. slide / activity / question)',
    },
    { name: 'lesson_ref_id', type: 'string', description: 'Lesson-side entity reference ID' },
    {
      name: 'session_ref_id',
      type: 'string',
      description: 'Session-side entity reference ID produced by materialization',
    },
    { name: 'created_at', type: 'string', description: 'Record creation timestamp (UTC, VARCHAR)' },
  ],
};

const noon2_core_lesson_share_link: AthenaTableMeta = {
  key: 'noon2_core_lesson_share_link',
  database: 'noon2_core',
  table: 'lesson_share_link',
  description:
    'Shareable access token for a lesson (version). Can expire (expires_at) or be revoked (revoked_at). ' +
    'Sqooped from noon2_core.',
  grain: '1 row = share link (id, UUID string)',
  partition: null,
  refreshCadence: 'Daily (sqooped)',
  accessLevel: 'all',
  scopeColumn: null,
  scopeType: null,
  columns: [
    { name: 'id', type: 'string', description: 'Share link ID (PK, UUID)' },
    { name: 'lesson_id', type: 'string', description: 'Lesson (FK → noon2_core.lesson.id)' },
    {
      name: 'lesson_version_id',
      type: 'string',
      description: 'Lesson version shared (FK → noon2_core.lesson_version.id)',
    },
    { name: 'token', type: 'string', description: 'Opaque share token' },
    { name: 'expires_at', type: 'string', description: 'Expiry timestamp, if any (UTC, VARCHAR)' },
    {
      name: 'revoked_at',
      type: 'string',
      description: 'Revocation timestamp, if any (UTC, VARCHAR). NULL = still valid',
    },
    { name: 'created_by', type: 'bigint', description: 'Profile ID that created the share link' },
    { name: 'created_at', type: 'string', description: 'Record creation timestamp (UTC, VARCHAR)' },
    {
      name: 'updated_at',
      type: 'string',
      description: 'Record last-updated timestamp (UTC, VARCHAR)',
    },
  ],
};

// ---------------------------------------------------------------------------
// datamart_v — Curated analyst views (KYY / activity quality)
// ---------------------------------------------------------------------------
// datamart_v is a separate Athena database of stored views curated by the analytics
// team. They pre-join campus/subject/curriculum context onto session & activity grain.
// Business-rule defaults STILL apply (exclude country_name='Noon internal', is_deleted, etc.)
// — these views do NOT pre-filter Nooners.
// ---------------------------------------------------------------------------

const kyy_nn_session_details: AthenaTableMeta = {
  key: 'kyy_nn_session_details',
  database: 'datamart_v',
  table: 'kyy_nn_session_details',
  description:
    'Curated session-level view: one row per course session with teacher, subject, course, campus and ' +
    'curriculum context pre-joined, plus session temperature and planned vs actual half-hour (h) durations. ' +
    'Session-grain — do NOT GROUP BY campus for session counts (hybrid-session trap); campus_* here reflect ' +
    "the course's owning campus, not per-student campus.",
  grain: '1 row = course session (course_session_id)',
  partition: null,
  refreshCadence: 'View (computed on query)',
  accessLevel: 'all',
  scopeColumn: null,
  scopeType: null,
  columns: [
    { name: 'course_session_id', type: 'bigint', description: 'Course session ID (grain)' },
    { name: 'course_id', type: 'bigint', description: 'Course ID (FK → d_course.course_id)' },
    { name: 'teacher_name', type: 'varchar', description: 'Name of the session teacher' },
    { name: 'date', type: 'date', description: 'Session date' },
    {
      name: 'session_temperature',
      type: 'double',
      description: 'Session temperature ((positive-negative)/total)×100, range -100..+100',
    },
    {
      name: 'planned_h_duration',
      type: 'bigint',
      description: 'Planned duration in half-hours (h = 30-min unit)',
    },
    {
      name: 'planned_uh_duration',
      type: 'bigint',
      description: 'Planned un-hybrid (uh) duration in half-hours',
    },
    { name: 'h_duration', type: 'decimal(38,2)', description: 'Actual half-hour-based duration' },
    { name: 'subject_id', type: 'bigint', description: 'Subject ID (FK → noon2_core.subject.id)' },
    {
      name: 'subject_name',
      type: 'varchar',
      description: 'Subject name (display only — classify by subject_id)',
    },
    {
      name: 'course_type',
      type: 'varchar',
      description: 'Course type (O2O / MARKETPLACE / SCHOOL)',
    },
    {
      name: 'country_name',
      type: 'varchar',
      description: "Country name of the course. ⚠ Exclude 'Noon internal'.",
    },
    { name: 'campus_id', type: 'bigint', description: 'Owning campus ID' },
    { name: 'campus_name', type: 'varchar', description: 'Owning campus name' },
    {
      name: 'campus_type',
      type: 'varchar',
      description: 'Campus type (e.g. UFFUQ / TRACKS / LABS / B2B / MARKETPLACE)',
    },
    { name: 'campus_name_eng', type: 'varchar', description: 'English short campus name' },
    { name: 'campus_gender', type: 'varchar', description: 'Campus gender segment' },
    { name: 'grade_eng', type: 'varchar', description: 'English grade label' },
    { name: 'teaching_mode', type: 'varchar', description: 'Teaching mode of the course/session' },
    { name: 'course_status', type: 'varchar', description: 'Course status' },
  ],
};

const nn_activity_details: AthenaTableMeta = {
  key: 'nn_activity_details',
  database: 'datamart_v',
  table: 'nn_activity_details',
  description:
    'Curated in-session activity view: one row per session activity (slide) with reaction/temperature counts ' +
    'AND question performance (attempted/correct, valid attempts, avg question duration) pre-aggregated, ' +
    'plus campus/subject context. Rows with NULL activity_type/poll_type are reaction-only slides (no question). ' +
    '⚠ Large view — always constrain by date and, where possible, course_session_id.',
  grain:
    '1 row = session activity slide (course_session_id + session_slide_id / classroom_activity_id)',
  partition: null,
  refreshCadence: 'View (computed on query)',
  accessLevel: 'all',
  scopeColumn: null,
  scopeType: null,
  columns: [
    { name: 'course_session_id', type: 'bigint', description: 'Course session ID' },
    { name: 'session_slide_id', type: 'bigint', description: 'Session slide ID for the activity' },
    {
      name: 'classroom_activity_id',
      type: 'bigint',
      description: 'Classroom activity ID (FK → d_classroom_activity.activity_id)',
    },
    { name: 'date', type: 'date', description: 'Session/activity date' },
    {
      name: 'activity_type',
      type: 'varchar',
      description: 'Activity type (NULL for reaction-only slides)',
      enumValues: [
        'ANNOTATION_RESPONSE',
        'BETTER_CALL_SAUL',
        'CUSTOM',
        'DRAG_AND_DROP_RESPONSE',
        'EMBEDDED',
        'EXIT_TICKET',
        'MARATHON',
        'OPEN_RESPONSE',
        'QUESTION',
        'SECTION_CHECK',
        'SQUID_GAME',
        'TEAM_DUEL',
        'TEAM_EXERCISE',
      ],
    },
    {
      name: 'poll_type',
      type: 'varchar',
      description:
        "Poll type of the activity (all questions are 'mcq' since Feb 2025); NULL for reaction-only slides",
      enumValues: ['mcq'],
    },
    {
      name: 'poll_type_2',
      type: 'varchar',
      description: 'Finer poll granularity (CUSTOM, QUESTION, MARATHON, EXIT_TICKET, TEAM_DUEL, …)',
    },
    { name: 'subject_id', type: 'bigint', description: 'Subject ID (FK → noon2_core.subject.id)' },
    {
      name: 'country_name',
      type: 'varchar',
      description: "Country name. ⚠ Exclude 'Noon internal'.",
    },
    { name: 'campus_name', type: 'varchar', description: 'Campus name' },
    { name: 'campus_id', type: 'bigint', description: 'Campus ID' },
    {
      name: 'campus_type',
      type: 'varchar',
      description: 'Campus type (UFFUQ / TRACKS / LABS / B2B / …)',
    },
    { name: 'campus_name_eng', type: 'varchar', description: 'English short campus name' },
    { name: 'campus_gender', type: 'varchar', description: 'Campus gender segment' },
    { name: 'grade_eng', type: 'varchar', description: 'English grade label' },
    {
      name: 'temperature_participants',
      type: 'bigint',
      description: 'Number of students who reacted (temperature denominator)',
    },
    {
      name: 'total_positive',
      type: 'bigint',
      description: 'Count of positive reactions at activity level',
    },
    {
      name: 'total_negative',
      type: 'bigint',
      description: 'Count of negative reactions at activity level',
    },
    {
      name: 'total_reactors_activity_level',
      type: 'bigint',
      description: 'Distinct reactors on this activity',
    },
    {
      name: 'activity_temp_reactions',
      type: 'bigint',
      description: 'Total reactions counted toward activity temperature',
    },
    { name: 'skipped', type: 'bigint', description: 'Count of skip reactions' },
    {
      name: 'planned_duration',
      type: 'bigint',
      description: 'Planned activity duration (seconds)',
    },
    {
      name: 'happened_duration',
      type: 'decimal(32,2)',
      description: 'Actual elapsed activity duration',
    },
    {
      name: 'duration',
      type: 'double',
      description: 'Effective activity duration used in reporting',
    },
    {
      name: 'questions_floated',
      type: 'double',
      description: 'Number of questions floated in the activity',
    },
    {
      name: 'activity_participants',
      type: 'bigint',
      description: 'Distinct students who participated in the activity',
    },
    { name: 'total_attempted', type: 'bigint', description: 'Total question attempts' },
    { name: 'correct_attempts', type: 'bigint', description: 'Total correct attempts' },
    {
      name: 'valid_attempts',
      type: 'bigint',
      description: 'Attempts counted as valid (excludes non-graded/edge cases)',
    },
    { name: 'valid_correct', type: 'bigint', description: 'Valid attempts that were correct' },
    {
      name: 'avg_q_duration',
      type: 'double',
      description: 'Average per-question answer duration (seconds)',
    },
  ],
};

const nn_activity_quality: AthenaTableMeta = {
  key: 'nn_activity_quality',
  database: 'datamart_v',
  table: 'nn_activity_quality',
  description:
    'Curated activity-quality view: one row per session activity with question metadata (difficulty, topic/chapter/subject), ' +
    'planned vs actual duration, and gamification signals (duel/BCS invites, punishment). ' +
    "⚠ KNOWN ISSUE (as of 2026-07-22): this stored view fails to compile in Athena — it references 'noon2_core.room' " +
    'which does not resolve in the query catalog, so direct SELECTs error with INVALID_VIEW. Treat the schema below ' +
    'as documentation until the underlying view is fixed; verify with a probe query before relying on it.',
  grain: '1 row = session activity (course_session_id + session_slide_id / activity_id)',
  partition: null,
  refreshCadence: 'View (computed on query) — currently non-compiling, see description',
  accessLevel: 'all',
  scopeColumn: null,
  scopeType: null,
  columns: [
    { name: 'activity_id', type: 'bigint', description: 'Classroom activity ID' },
    { name: 'course_session_id', type: 'bigint', description: 'Course session ID' },
    { name: 'session_slide_id', type: 'bigint', description: 'Session slide ID' },
    {
      name: 'type',
      type: 'varchar',
      description:
        'Activity/question type (mirrors activity type families; enum unverified — view non-compiling)',
    },
    {
      name: 'question_id',
      type: 'bigint',
      description: 'Question ID (FK → d_question.question_id)',
    },
    { name: 'difficulty_level', type: 'int', description: 'Question difficulty level (1-5)' },
    { name: 'topic_id', type: 'bigint', description: 'Topic ID (FK → noon2_core.topic.id)' },
    { name: 'topic_name', type: 'varchar', description: 'Topic name' },
    { name: 'chapter_id', type: 'bigint', description: 'Chapter ID (FK → noon2_core.chapter.id)' },
    { name: 'chapter_name', type: 'varchar', description: 'Chapter name' },
    { name: 'subject_id', type: 'bigint', description: 'Subject ID (FK → noon2_core.subject.id)' },
    { name: 'subject_name', type: 'varchar', description: 'Subject name (display only)' },
    { name: 'date', type: 'date', description: 'Session/activity date' },
    {
      name: 'planned_duration',
      type: 'bigint',
      description: 'Planned activity duration (seconds)',
    },
    { name: 'duration', type: 'decimal(32,2)', description: 'Actual activity duration' },
    {
      name: 'activity_happened',
      type: 'int',
      description: '1 = activity actually ran, 0 = did not',
    },
    { name: 'punishment', type: 'bigint', description: 'Gamification punishment signal count' },
    { name: 'duel_invites', type: 'bigint', description: 'Team-duel invites issued' },
    { name: 'bcs_invites', type: 'bigint', description: 'Better-Call-Saul invites issued' },
  ],
};

// ---------------------------------------------------------------------------
// noon2_replit — Analyst views (nn_* metrics, hk_* fact rebuilds, transcriptions)
// ---------------------------------------------------------------------------
// nn_* and hk_* are analyst-curated views in the noon2_replit database. Defaults STILL
// apply (exclude Nooners, deleted rows, filter user_type='STUDENT' for student metrics).
// ---------------------------------------------------------------------------

const nn_assessment_details: AthenaTableMeta = {
  key: 'nn_assessment_details',
  database: 'noon2_replit',
  table: 'nn_assessment_details',
  description:
    'Curated assessment view at student × question grain, tagged by program (Qudrat/Tahsili/Nafes/National Curriculum/ESL), ' +
    'subject_type, level, campus and teacher. Pre-computes total_questions / total_attempts / total_questions_correct and ' +
    'avg_time_taken. Use for program-level assessment performance. ⚠ A same-named view also exists in datamart_v — this is ' +
    'the noon2_replit one.',
  grain: '1 row = student × assessment question (profile_id + question_id)',
  partition: null,
  refreshCadence: 'View (computed on query)',
  accessLevel: 'all',
  scopeColumn: 'profile_id',
  scopeType: 'user_id',
  columns: [
    { name: 'profile_id', type: 'bigint', description: 'Student profile ID (= user_id)' },
    { name: 'assessment_label', type: 'varchar', description: 'Assessment label/identifier' },
    {
      name: 'program',
      type: 'varchar',
      description: 'Learning program',
      enumValues: [
        'Qudrat',
        'Tahsili',
        'Nafes',
        'High School National Curriculum',
        'Middle School National Curriculum',
        'ESL',
        'لغتي',
      ],
    },
    {
      name: 'subject_type',
      type: 'varchar',
      description: 'Subject family',
      enumValues: [
        'Quant',
        'Verbal',
        'Mathematics',
        'Physics',
        'Chemistry',
        'Biology',
        'Science',
        'Arabic',
        'ESL',
        'لغتي',
      ],
    },
    {
      name: 'level',
      type: 'varchar',
      description:
        'Level within the program (mainly Qudrat/ESL). NULL for programs without levels.',
      enumValues: ['Level 1', 'Level 2', 'Level 3'],
    },
    { name: 'subject_id', type: 'bigint', description: 'Subject ID (FK → noon2_core.subject.id)' },
    { name: 'subject_name', type: 'varchar', description: 'Subject name (display only)' },
    {
      name: 'question_id',
      type: 'bigint',
      description: 'Question ID (FK → d_question.question_id)',
    },
    { name: 'difficulty_level', type: 'int', description: 'Question difficulty level (1-5)' },
    { name: 'chapter_id', type: 'bigint', description: 'Chapter ID (FK → noon2_core.chapter.id)' },
    { name: 'chapter_name', type: 'varchar', description: 'Chapter name' },
    { name: 'campus_type', type: 'varchar', description: 'Campus type' },
    { name: 'campus_gender', type: 'varchar', description: 'Campus gender segment' },
    { name: 'campus_name', type: 'varchar', description: 'Campus name' },
    { name: 'course_teacher_id', type: 'bigint', description: 'Course teacher profile ID' },
    { name: 'teacher_name', type: 'varchar', description: 'Teacher name' },
    { name: 'grade_eng', type: 'varchar', description: 'English grade label' },
    { name: 'date', type: 'timestamp', description: 'Assessment attempt datetime (UTC)' },
    {
      name: 'total_questions',
      type: 'bigint',
      description: 'Total questions in the assessment (at this grain)',
    },
    { name: 'total_attempts', type: 'bigint', description: 'Total attempts made' },
    {
      name: 'total_questions_correct',
      type: 'bigint',
      description: 'Total questions answered correctly',
    },
    {
      name: 'avg_time_taken',
      type: 'double',
      description: 'Average time taken per question (seconds)',
    },
  ],
};

const nn_learning_gains: AthenaTableMeta = {
  key: 'nn_learning_gains',
  database: 'noon2_replit',
  table: 'nn_learning_gains',
  description:
    'Pre/post learning-gains view: one row per student per program/subject/level with a pre-test and a post-test ' +
    'score and question count (compute gain as post_score/post_total_ques − pre_score/pre_total_ques). Used for ' +
    'measuring learning improvement across a program cohort.',
  grain: '1 row = student × program × subject × level (user_id)',
  partition: null,
  refreshCadence: 'View (computed on query)',
  accessLevel: 'all',
  scopeColumn: 'user_id',
  scopeType: 'user_id',
  columns: [
    { name: 'user_id', type: 'bigint', description: 'Student profile ID (= user_id)' },
    { name: 'campus', type: 'varchar', description: 'Campus name/label' },
    {
      name: 'program',
      type: 'varchar',
      description: 'Learning program',
      enumValues: [
        'Qudrat',
        'Tahsili',
        'Nafes',
        'High School National Curriculum',
        'Middle School National Curriculum',
        'ESL',
      ],
    },
    {
      name: 'subject',
      type: 'varchar',
      description: 'Subject family',
      enumValues: [
        'Quant',
        'Verbal',
        'Mathematics',
        'Physics',
        'Chemistry',
        'Biology',
        'Arabic',
        'ESL',
      ],
    },
    {
      name: 'level',
      type: 'varchar',
      description: 'Level/grade label',
      enumValues: ['Level 1', 'Level 2', 'Level 3', 'Grade 10', 'Grade 11', 'Grade 12'],
    },
    { name: 'pre_score', type: 'bigint', description: 'Number of correct answers on the pre-test' },
    { name: 'pre_total_ques', type: 'bigint', description: 'Total questions on the pre-test' },
    { name: 'pre_date', type: 'date', description: 'Date of the pre-test' },
    {
      name: 'post_score',
      type: 'bigint',
      description: 'Number of correct answers on the post-test',
    },
    { name: 'post_total_ques', type: 'bigint', description: 'Total questions on the post-test' },
    { name: 'post_date', type: 'date', description: 'Date of the post-test' },
  ],
};

const hk_f_course_session: AthenaTableMeta = {
  key: 'hk_f_course_session',
  database: 'noon2_replit',
  table: 'hk_f_course_session',
  description:
    'Analyst rebuild of session-level facts (hk_ = curated). One row per course session with teaching/session time, ' +
    'avg & median active time per student, segment/breakout counts, temperature (positive/negative/neutral users), ' +
    'spotlight usage, curriculum arrays, feature active-duration JSON, and lesson-template tags. ' +
    'Session-grain — do NOT GROUP BY campus (has no campus column; hybrid-session trap). Filter ' +
    'is_course_session_deleted=0 / is_course_deleted=0.',
  grain: '1 row = course session (course_session_id)',
  partition: null,
  refreshCadence: 'View (computed on query)',
  accessLevel: 'all',
  scopeColumn: null,
  scopeType: null,
  columns: [
    { name: 'course_session_id', type: 'bigint', description: 'Course session ID (grain)' },
    { name: 'course_id', type: 'bigint', description: 'Course ID (FK → d_course.course_id)' },
    { name: 'course_session_name', type: 'varchar', description: 'Session name' },
    {
      name: 'course_session_class_type',
      type: 'varchar',
      description: 'Live class type',
      enumValues: ['LIVE_CLASS', 'LIVE_MASTERY'],
    },
    {
      name: 'course_session_type',
      type: 'varchar',
      description: 'Delivery type',
      enumValues: ['HYBRID', 'ONLINE', 'OFFLINE'],
    },
    {
      name: 'is_course_session_paid',
      type: 'tinyint',
      description: '1 = paid session',
      enumValues: ['0', '1'],
    },
    { name: 'course_teacher_id', type: 'bigint', description: 'Course teacher profile ID' },
    {
      name: 'course_session_teacher_id',
      type: 'bigint',
      description: 'Teacher with longest room presence (may differ from course_teacher_id)',
    },
    {
      name: 'course_session_scheduled_start_time',
      type: 'timestamp',
      description: 'Scheduled start (UTC)',
    },
    {
      name: 'course_session_scheduled_end_time',
      type: 'timestamp',
      description: 'Scheduled end (UTC)',
    },
    { name: 'room_open_time', type: 'timestamp', description: 'Room open time (UTC)' },
    { name: 'room_end_time', type: 'timestamp', description: 'Room end time (UTC)' },
    {
      name: 'teacher_start_time',
      type: 'timestamp',
      description: 'First teacher entry (UTC). NULL for Live Mastery.',
    },
    { name: 'teacher_end_time', type: 'timestamp', description: 'Last teacher exit (UTC)' },
    {
      name: 'teaching_time',
      type: 'decimal(27,2)',
      description:
        'Teaching time in minutes (first entry → last exit of teacher). 0 for Live Mastery.',
    },
    { name: 'session_time', type: 'decimal(27,2)', description: 'Session time in minutes' },
    {
      name: 'avg_active_time_per_student',
      type: 'decimal(29,2)',
      description: 'Average student active time (minutes)',
    },
    {
      name: 'median_active_time_per_student',
      type: 'decimal(29,2)',
      description: 'Median student active time (minutes)',
    },
    {
      name: 'course_session_status',
      type: 'varchar',
      description: 'Session status',
      enumValues: ['ended', 'planned', 'scheduled'],
    },
    { name: 'course_section_id', type: 'bigint', description: 'Course section (week/unit) ID' },
    {
      name: 'room_ids',
      type: 'array<bigint>',
      description: 'All room IDs in the session (use CONTAINS, not LIKE/IN)',
    },
    { name: 'main_room_id', type: 'int', description: 'Main room ID' },
    { name: 'total_segments', type: 'bigint', description: 'Number of segments in the session' },
    { name: 'total_breakouts', type: 'bigint', description: 'Number of breakouts planned' },
    {
      name: 'total_breakouts_happened',
      type: 'bigint',
      description: 'Number of breakouts that happened',
    },
    {
      name: 'feature_avg_active_duration',
      type: 'varchar',
      description: 'Avg feature active-duration (JSON string — parse with get_json_object)',
    },
    {
      name: 'feature_median_active_duration',
      type: 'varchar',
      description: 'Median feature active-duration (JSON string)',
    },
    {
      name: 'activity_feature_avg_active_duration',
      type: 'varchar',
      description: 'Avg feature active-duration during activities (JSON string)',
    },
    {
      name: 'activity_feature_median_active_duration',
      type: 'varchar',
      description: 'Median feature active-duration during activities (JSON string)',
    },
    {
      name: 'session_slide_id_list',
      type: 'array<varchar>',
      description: 'List of session slide IDs (use CONTAINS)',
    },
    { name: 'subject_id', type: 'bigint', description: 'Subject ID (FK → noon2_core.subject.id)' },
    {
      name: 'chapter_ids',
      type: 'array<bigint>',
      description: 'Chapter IDs covered (use CONTAINS)',
    },
    { name: 'topic_ids', type: 'array<bigint>', description: 'Topic IDs covered (use CONTAINS)' },
    {
      name: 'sub_topic_ids',
      type: 'array<bigint>',
      description: 'Subtopic IDs covered (use CONTAINS)',
    },
    {
      name: 'concept_ids',
      type: 'array<bigint>',
      description: 'Concept IDs covered (use CONTAINS)',
    },
    {
      name: 'is_course_session_deleted',
      type: 'tinyint',
      description: 'Soft-delete flag for the session (filter =0)',
      enumValues: ['0', '1'],
    },
    {
      name: 'is_course_deleted',
      type: 'tinyint',
      description: 'Soft-delete flag for the course (filter =0)',
      enumValues: ['0', '1'],
    },
    { name: 'created_at', type: 'timestamp', description: 'Record creation timestamp (UTC)' },
    {
      name: 'positive_users',
      type: 'bigint',
      description: 'Users with positive sentiment (temperature numerator+)',
    },
    {
      name: 'negative_users',
      type: 'bigint',
      description: 'Users with negative sentiment (temperature numerator−)',
    },
    { name: 'neutral_users', type: 'bigint', description: 'Users with neutral sentiment' },
    {
      name: 'session_temperature',
      type: 'double',
      description: 'Session temperature ((positive-negative)/total)×100, range -100..+100',
    },
    { name: 'spotlight_count', type: 'bigint', description: 'Number of spotlight events' },
    {
      name: 'total_spotlight_duration_seconds',
      type: 'bigint',
      description: 'Total spotlight duration (seconds)',
    },
    {
      name: 'lesson_template_key',
      type: 'varchar',
      description:
        'Lesson Builder template key, if the session used a lesson (FK sense → noon2_core.lesson.template_key). Currently sparsely populated.',
    },
    {
      name: 'lesson_template_version',
      type: 'int',
      description: 'Lesson Builder template version, if applicable',
    },
  ],
};

const hk_f_user_session: AthenaTableMeta = {
  key: 'hk_f_user_session',
  database: 'noon2_replit',
  table: 'hk_f_user_session',
  description:
    'Analyst rebuild of f_user_session (hk_ = curated): one row per user × session with attendance, learning/room/active/lobby ' +
    'time, poll & engagement counts, platforms/devices, classroom info, and curriculum context. Mirrors noon2_datamart.f_user_session ' +
    "field-for-field. ⚠ Filter user_type='STUDENT' for student queries; exclude Nooners via country_names. Partitioned on dt (int YYYYMMDD).",
  grain: '1 row = user × course session (user_id + course_session_id)',
  partition: 'dt',
  refreshCadence: 'View (computed on query)',
  accessLevel: 'all',
  scopeColumn: 'user_id',
  scopeType: 'user_id',
  columns: [
    { name: 'user_id', type: 'int', description: 'User profile ID' },
    { name: 'user_name', type: 'varchar', description: 'User name' },
    {
      name: 'user_type',
      type: 'varchar',
      description: 'User type (case-sensitive UPPERCASE)',
      enumValues: ['FACILITATOR', 'PRESENTER', 'STUDENT', 'TEACHER', 'TEACHING_ASSISTANT'],
    },
    {
      name: 'user_sentiment',
      type: 'varchar',
      description: 'Combined user sentiment',
      enumValues: ['negative', 'neutral', 'positive'],
    },
    { name: 'course_session_id', type: 'bigint', description: 'Course session ID' },
    { name: 'course_id', type: 'bigint', description: 'Course ID (FK → d_course.course_id)' },
    {
      name: 'course_session_class_type',
      type: 'varchar',
      description: 'Live class type',
      enumValues: ['LIVE_CLASS', 'LIVE_MASTERY'],
    },
    { name: 'room_id', type: 'bigint', description: 'Room ID' },
    {
      name: 'room_ids',
      type: 'array<bigint>',
      description: 'Room IDs joined by this user (use CONTAINS)',
    },
    { name: 'total_rooms_joined', type: 'bigint', description: 'Total rooms joined' },
    { name: 'total_breakouts_attended', type: 'bigint', description: 'Breakout rooms attended' },
    {
      name: 'total_breakouts_happened',
      type: 'bigint',
      description: 'Breakout rooms that happened',
    },
    { name: 'teacher_id', type: 'bigint', description: 'Teacher profile ID for the session' },
    {
      name: 'is_course_session_teacher',
      type: 'tinyint',
      description: '1 = this user is the session teacher',
      enumValues: ['0', '1'],
    },
    {
      name: 'teacher_start_datetime',
      type: 'timestamp',
      description: 'First teacher entry (UTC). NULL for Live Mastery.',
    },
    { name: 'teacher_end_datetime', type: 'timestamp', description: 'Last teacher exit (UTC)' },
    {
      name: 'teaching_time',
      type: 'decimal(38,2)',
      description: 'Teaching time in minutes (teachers)',
    },
    { name: 'session_time', type: 'decimal(38,2)', description: 'Session time in minutes' },
    { name: 'room_open_time', type: 'timestamp', description: 'Room open time (UTC)' },
    { name: 'room_end_time', type: 'timestamp', description: 'Room end time (UTC)' },
    { name: 'user_enter_time', type: 'timestamp', description: 'First user entry (UTC)' },
    { name: 'user_exit_time', type: 'timestamp', description: 'Last user exit (UTC)' },
    {
      name: 'entered_room',
      type: 'bigint',
      description: 'Number of times the user entered the room',
    },
    {
      name: 'room_time',
      type: 'decimal(38,2)',
      description: 'Total time in room (minutes, includes lobby)',
    },
    {
      name: 'learning_time',
      type: 'decimal(38,2)',
      description:
        "Time with teacher present (minutes). ⚠ Filter learning_time >= 0 for 'time studying'.",
    },
    {
      name: 'lobby_before_time',
      type: 'decimal(38,2)',
      description: 'Lobby time before teacher joined (minutes)',
    },
    {
      name: 'lobby_after_time',
      type: 'decimal(38,2)',
      description: 'Lobby time after teacher left (minutes)',
    },
    { name: 'lobby_time', type: 'decimal(38,2)', description: 'Total lobby time (minutes)' },
    {
      name: 'active_time',
      type: 'decimal(38,2)',
      description: 'Total active time for student (minutes). NULL for teacher.',
    },
    { name: 'total_polls_seen', type: 'bigint', description: 'Total polls seen by the student' },
    {
      name: 'total_polls_responded',
      type: 'bigint',
      description: 'Total polls answered by the student',
    },
    { name: 'total_messages', type: 'bigint', description: 'Total chat messages sent' },
    { name: 'total_hand_raise', type: 'bigint', description: 'Total hand raises' },
    { name: 'total_unmutes', type: 'bigint', description: 'Total unmutes' },
    { name: 'total_video_on', type: 'bigint', description: 'Total times video turned on' },
    {
      name: 'platforms',
      type: 'array<varchar>',
      description: 'Platforms used (use CONTAINS)',
      enumValues: ['android', 'ios', 'web'],
    },
    { name: 'device_ids', type: 'array<varchar>', description: 'Device IDs used (use CONTAINS)' },
    {
      name: 'country_ids',
      type: 'array<int>',
      description: 'Country IDs of the course (use CONTAINS)',
    },
    {
      name: 'country_names',
      type: 'array<varchar>',
      description: "Country names of the course. ⚠ Exclude 'Noon internal' (ANY_MATCH).",
    },
    {
      name: 'feature_active_duration',
      type: 'varchar',
      description: 'Feature active-duration (JSON string)',
    },
    {
      name: 'feature_active_duration_during_activity',
      type: 'varchar',
      description: 'Feature active-duration during activities (JSON string)',
    },
    {
      name: 'classroom_name',
      type: 'varchar',
      description: 'Physical classroom name (first joined)',
    },
    {
      name: 'classroom_description',
      type: 'varchar',
      description: 'Physical classroom description',
    },
    { name: 'classroom_join_code', type: 'varchar', description: 'Physical classroom join code' },
    {
      name: 'dt',
      type: 'int',
      description: 'Partition column YYYYMMDD (int) — ALWAYS filter to avoid full scans',
    },
  ],
};

const hk_session_questions: AthenaTableMeta = {
  key: 'hk_session_questions',
  database: 'noon2_replit',
  table: 'hk_session_questions',
  description:
    'Analyst view of questions floated in sessions (hk_ = curated): one row per session × question with question metadata ' +
    '(text, type, difficulty, chapter/topic/subtopic), poll granularity, segment type, and seen/answered/valid/correct counts. ' +
    'Use for question-quality and session-question performance analysis.',
  grain: '1 row = course session × question (course_session_id + question_id)',
  partition: null,
  refreshCadence: 'View (computed on query)',
  accessLevel: 'all',
  scopeColumn: null,
  scopeType: null,
  columns: [
    { name: 'course_session_id', type: 'bigint', description: 'Course session ID' },
    {
      name: 'question_id',
      type: 'bigint',
      description: 'Question ID (FK → d_question.question_id)',
    },
    { name: 'question_text', type: 'varchar', description: 'Question text' },
    {
      name: 'question_type',
      type: 'varchar',
      description: 'Whether the question is graded',
      enumValues: ['has correct answer', 'no correct answer'],
    },
    {
      name: 'choice_type',
      type: 'varchar',
      description: 'Answer/choice format',
      enumValues: ['MCQ', 'ANNOTATION', 'MATCH', 'OPEN_TEXT'],
    },
    {
      name: 'poll_type_2',
      type: 'varchar',
      description:
        'Finer poll/activity granularity (in-session families like CUSTOM/QUESTION/MARATHON/EXIT_TICKET/TEAM_DUEL/TEAM_EXERCISE/SECTION_CHECK/SQUID_GAME/BETTER_CALL_SAUL/OPEN_RESPONSE/ANNOTATION_RESPONSE/DRAG_AND_DROP_RESPONSE/EMBEDDED, plus practice families: practice/revision/mcq/poll/on-demand mastery/smart practice/custom practice/daily challenge)',
    },
    {
      name: 'segment_type',
      type: 'varchar',
      description: 'Segment the question ran in',
      enumValues: ['MAIN', 'BREAKOUT', 'LIVE_MASTERY'],
    },
    { name: 'campus_type', type: 'varchar', description: 'Campus type' },
    { name: 'chapter_name', type: 'varchar', description: 'Chapter name' },
    { name: 'topic_name', type: 'varchar', description: 'Topic name' },
    { name: 'subtopic_name', type: 'varchar', description: 'Subtopic name' },
    { name: 'difficulty_level', type: 'int', description: 'Question difficulty level (1-5)' },
    {
      name: 'is_suitable_for_practice',
      type: 'tinyint',
      description: '1 = question is suitable for practice',
      enumValues: ['0', '1'],
    },
    {
      name: 'poll_created_at',
      type: 'timestamp',
      description: 'When the poll/question was floated (UTC)',
    },
    {
      name: 'questions_seen',
      type: 'bigint',
      description: 'Number of students who saw the question',
    },
    { name: 'questions_answered', type: 'bigint', description: 'Number of students who answered' },
    {
      name: 'valid_qs_done',
      type: 'bigint',
      description: 'Valid answered count (excludes non-graded/edge cases)',
    },
    { name: 'valid_correct', type: 'bigint', description: 'Valid answers that were correct' },
  ],
};

const session_transcriptions: AthenaTableMeta = {
  key: 'session_transcriptions',
  database: 'noon2_replit',
  table: 'session_transcriptions',
  description:
    'Speech-to-text transcript segments for course sessions: one row per utterance with speaker, timing, and text. ' +
    'Use for content/transcript analysis of what was said in a session. ⚠ start_time/end_time are VARCHAR (segment offsets, ' +
    'not absolute timestamps). Transcript text may contain personal references — treat as sensitive.',
  grain: '1 row = transcript utterance (course_session_id + start_time)',
  partition: null,
  refreshCadence: 'View (computed on query)',
  accessLevel: 'all',
  scopeColumn: null,
  scopeType: null,
  columns: [
    {
      name: 'course_session_id',
      type: 'bigint',
      description: 'Course session ID (FK → f_course_session.course_session_id)',
    },
    { name: 'speaker', type: 'varchar', description: 'Speaker label/identifier for the utterance' },
    { name: 'text', type: 'varchar', description: 'Transcribed text of the utterance' },
    {
      name: 'start_time',
      type: 'varchar',
      description: 'Utterance start offset within the session (VARCHAR)',
    },
    {
      name: 'end_time',
      type: 'varchar',
      description: 'Utterance end offset within the session (VARCHAR)',
    },
  ],
};

// ---------------------------------------------------------------------------
// REGISTRY — Single export
// ---------------------------------------------------------------------------

export const ATHENA_REGISTRY: Record<string, AthenaTableMeta> = {
  // Layer 3 — Aggregation
  f_user_session,
  f_user_playback,
  f_student_activity,
  f_user_segment,
  // Layer 2 — Fact tables
  f_classroom_events,
  f_client_student_events,
  f_user_poll,
  f_user_survey,
  f_course_session,
  f_user_assessment,
  f_user_reaction,
  f_transaction_details,
  f_user_note,
  // Layer 2 — Dimension tables
  d_user,
  d_course,
  d_school_student_courses,
  d_chapter,
  d_question,
  d_assessment,
  d_classroom_activity,
  d_bundle,
  d_mission,
  d_practice_target,
  // AI-Generated tables
  ai_chat_message_labeled_emotions_with_reason,
  // Raw source tables (noon2_core — sqooped)
  prediction,
  prediction_run,
  noon2_core_subject,
  noon2_core_chapter,
  noon2_core_topic,
  assessment_schedule,
  noon2_core_schedule,
  noon2_core_school_calendar,
  // Replit views (canonical pre-aggregated sources)
  homework_completion_kyy,
  kyy_hw_assigned,
  // Raw source tables (noon2_core — rooms)
  noon2_core_room,
  noon2_core_question_explanation,
  // Raw source tables (noon2_core — surveys)
  noon2_core_survey_template,
  noon2_core_survey,
  noon2_core_survey_question,
  noon2_core_survey_question_choice,
  noon2_core_survey_answer,
  // Raw source tables (noon2_core — facilitator)
  noon2_core_notes,
  noon2_core_note_task_mapping,
  noon2_core_task_templates,
  noon2_core_task_instance,
  // Raw source tables (noon2_core — ODM)
  noon2_core_on_demand_session,
  noon2_core_on_demand_mastery_session,
  noon2_core_mastery_question,
  // Raw source tables (noon2_core — reference)
  noon2_core_choice,
  noon2_core_grade,
  noon2_core_campus,
  noon2_core_campus_managers,
  noon2_core_profile,
  // Raw source tables (noon2_core — MCQ)
  noon2_core_mcq,
  noon2_core_mcq_selected_choice,
  noon2_core_mcq_selected_choice_choices,
  // noon2_datamart — activity feature duration
  f_user_activity_feature_duration,
  // Lesson Builder model (noon2_core)
  noon2_core_lesson,
  noon2_core_lesson_version,
  noon2_core_lesson_session_link,
  noon2_core_lesson_activity,
  noon2_core_lesson_activity_question,
  noon2_core_lesson_curriculum,
  noon2_core_lesson_segment,
  noon2_core_lesson_session_materialization,
  noon2_core_lesson_session_materialization_mapping,
  noon2_core_lesson_share_link,
  // datamart_v — curated analyst views
  kyy_nn_session_details,
  nn_activity_details,
  nn_activity_quality,
  // noon2_replit — analyst views (nn_* / hk_* / transcriptions)
  nn_assessment_details,
  nn_learning_gains,
  hk_f_course_session,
  hk_f_user_session,
  hk_session_questions,
  session_transcriptions,
};

// ---------------------------------------------------------------------------
// Helper — filter tables by role
// ---------------------------------------------------------------------------

export function getVisibleTables(role: string): AthenaTableMeta[] {
  return Object.values(ATHENA_REGISTRY).filter((t) => {
    if (t.accessLevel === 'admin_only') return role === 'admin';
    if (t.accessLevel === 'leader_and_above')
      return ['admin', 'school_manager', 'school_leader'].includes(role);
    return true; // "all"
  });
}

// ---------------------------------------------------------------------------
// Helper — build system prompt context for Claude
// ---------------------------------------------------------------------------

export function buildAthenaSchemaContext(role: string): string {
  const tables = getVisibleTables(role);
  if (tables.length === 0) return '';

  const lines: string[] = [
    '',
    '─── Athena Datamart Tables (noon2_datamart) ───',
    'يمكنك استخدام أداة run_athena_query للاستعلام عن الجداول التالية:',
    '',
  ];

  for (const t of tables) {
    lines.push(`## ${t.table}`);
    lines.push(`${t.description}`);
    lines.push(
      `Grain: ${t.grain} | Partition: ${t.partition ?? 'none'} | Refresh: ${t.refreshCadence}`,
    );
    if (t.scopeColumn) {
      lines.push(`⚠ Scoped on: ${t.scopeColumn} (auto-filtered by user role)`);
    }
    lines.push('Columns:');
    for (const col of t.columns) {
      let colLine = `  - ${col.name} (${col.type}): ${col.description}`;
      if (col.enumValues && col.enumValues.length > 0) {
        colLine += ` [values: ${col.enumValues.join(' | ')}]`;
      }
      lines.push(colLine);
    }
    if (t.exampleQueries && t.exampleQueries.length > 0) {
      lines.push('Example queries:');
      for (const eq of t.exampleQueries) {
        lines.push(`  ${eq.split('\n')[0]}`); // Just the comment line as hint
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Business Rules — institutional knowledge from FAQ & team practices
// ---------------------------------------------------------------------------
// Sourced from: https://www.notion.so/noonacademy/Noon-2-0-Data-FAQ-583238abf52a4f41a1f15b1b4cf04e41
// These rules capture domain knowledge that schemas alone can't express.
// Load alongside COMPACT_TABLE_OVERVIEW in the system prompt.
// ---------------------------------------------------------------------------

export const BUSINESS_RULES = `
─── Noon Data Business Rules & Gotchas ───
These rules reflect how the Noon analytics team actually uses the data. Follow them strictly.

━━━ EXCLUDING INTERNAL EMPLOYEES ━━━
• Always exclude Noon employees from student/teacher queries using: country_name != 'Noon internal' (from d_user)
• Alternative: JOIN to datamart_v.kyy_noon2_internal_employees to exclude known Nooner accounts/profiles
• Also exclude Noon internal courses by filtering out courses with country_names containing 'Noon internal'

━━━ TIME METRICS — CRITICAL DISTINCTIONS ━━━
• "Time spent studying" / "learning time" → Use learning_time from f_user_session (time with teacher present)
• "Time in session" / "room time" → Use room_time from f_user_session (total time in room, includes lobby)
• "Teaching time" → Use teaching_time from f_course_session (first entry to last exit of teacher)
• "Active time" ≠ "Active students". active_time is a specific metric from MongoDB. "Active students" = any student with a row in f_student_activity.
• "Activation" metrics → Use time_spent_learning from f_student_activity
• For playbacks: learning_time can be inaccurate if student backgrounds the app (internet disconnect = still counted)
• ⚠ A handful of students have negative learning_time due to bugs → filter: learning_time >= 0
• ⚠ Some playbacks show extremely long learning_time → capped at 2×room_duration

━━━ POLLS, MCQs & ACTIVITIES ━━━
• Polls were DEPRECATED in Feb 2025. All new questions are poll_type = 'mcq'
• Polls still appear in recaps/playbacks; students can still answer old polls
• MCQ ID ≠ Question ID. The mcq table links questions to sessions. Always join: mcq.question_id = question.id
• poll_type_2 gives finer granularity: CUSTOM, QUESTION, MARATHON, TEAM_DUEL, TEAM_EXERCISE, EXIT_TICKET, etc.
• To get polls actually seen: poll_seen = 1. Polls answered: poll_answered = 1 or selected_choice_id > 0
• The same poll_id can exist across different poll_types — always filter by poll_type too
• Poll subject: resolve via d_question.subject_id (JOIN on question_id), NOT d_course.subject_id (~6% misattribution verified).
• Non-graded polls (chapter_name = 'محتوى خاص') produce false 0% accuracy — exclude when computing accuracy rankings.

━━━ PLAYBACKS & RECAPS ━━━
• "Playback" = "Recap" — same thing, different naming (internal vs student-facing)
• playback_session_id is unique per viewing attempt, even for the same session watched twice

━━━ COURSES & MEMBERSHIP ━━━
• Course type: O2O (access code), MARKETPLACE (payment), SCHOOL (school-managed)
• A student can be part of a course via: (1) direct join (profile_ids in d_course), (2) cohort (d_school_student_courses), (3) community membership
• d_course.profile_ids only shows NON-cohort joined members; for school students use d_school_student_courses
• Ufuq Schools = campus_type = 'UFFUQ' in d_user (double F). Legacy campus_ids 68-77 still work. ⚠ kyy_hw_assigned uses 'UFUQ' (single F).
• Tracks students: campus_type = 'TRACKS' in d_user (general filtering)
• Tracks filter for homework analysis (canonical): campus_type = 'TRACKS' AND cohort_name LIKE '%ثانوي%' AND cohort_name NOT LIKE '%قدرات%' — this excludes Qudrat-only cohorts that happen to sit on Tracks campuses. Use this stricter filter whenever doing homework/completion analysis.

━━━ SESSIONS & ROOMS ━━━
• A course_session needs a room to start. room_id should be 1:1 with session (except early July 2023 edge cases)
• Room end logic: (1) no teacher → ends 1hr after start, (2) teacher disconnects → ends 15min later, (3) teacher idle → ends 4.5hr after start
• course_session_teacher_id = teacher with LONGEST presence in room (may differ from course_teacher_id)
• For Live Mastery sessions: teaching_time = 0, teacher fields are NULL (teacherless sessions)
• Session temperature: ((positive_users - negative_users) / total_users) × 100, range -100 to +100
• Hybrid sessions span multiple campuses. Never GROUP BY campus on session-level data — inflates counts 2-2.5×. Use student-level metrics if campus grouping is needed.

━━━ SURVEYS ━━━
• survey_template_id = 5 → end-of-session satisfaction reactions (LOVED, STRONGER, CONFUSED, SAD)
• Silent surveys were decommissioned July 2025; historical choice_id is NULL for those
• f_user_survey shows BOTH responded and not-responded surveys

━━━ ASSESSMENTS ━━━
• Assessment types: END_OF_CHAPTER, END_OF_SEMESTER, HOMEWORK, QUDRAT_SIMULATOR, TAHSILI_SIMULATOR, MOCK_MISSION, ONLINE, OTHER
━━━ USER & ACCOUNT STRUCTURE ━━━
• Account = tied to phone/email. Profile = within account (student/teacher/admin). One account → multiple profiles.
• user_id = profile_id (same thing, different naming across tables)
• student_id in PostgreSQL = user_id in Athena datamart
• PII (email/phone) is NOT in d_user for privacy. Use noon2_core.account if needed (requires explicit reason).
• d_user.created_at = when profile was created (not necessarily when student first used Noon)

━━━ DATA REFRESH & QUALITY ━━━
• noon2_datamart refreshes every 12h around 12:30 AM/PM UTC, usually complete by 1-2 AM/PM UTC
• noon2_core refreshes every 12h around 12:00 AM/PM UTC
• ⚠ July/Aug 2023 data may have bugs (teaching_time, room_time, entry/exit times)
• Events fired AFTER room ended (sometimes days later) have been capped to room_end_time

━━━ PARTITIONED TABLES — ALWAYS USE dt ━━━
• Partitioned tables (f_user_session, f_user_playback, f_student_activity, f_classroom_events, f_client_student_events, f_user_reaction, f_user_poll): ALWAYS filter on dt to avoid full-table scans
• dt format: YYYYMMDD as bigint (e.g., 20240415)
• Non-partitioned fact tables (f_user_survey, f_course_session, f_user_assessment, f_transaction_details, f_user_note): no dt filter needed
`;

// ---------------------------------------------------------------------------
// Compact Overview — lightweight table summary for initial context loading
// ---------------------------------------------------------------------------
// This is the "Layer 1" of the agent's context system.
// Claude reads this first (~60 lines) to decide which 2-4 tables are relevant,
// then loads full schemas only for those tables via buildAthenaSchemaContext().
// This saves ~80% of prompt tokens on most queries.
// ---------------------------------------------------------------------------

export const COMPACT_TABLE_OVERVIEW = `
─── Athena Datamart: Table Overview ───
Use this overview to identify which tables are relevant, then load their full schemas.
Database: noon2_datamart | Refresh: Every 12 hours | Partitioned tables use dt (YYYYMMDD)
⚠ Always exclude Noon employees: country_name != 'Noon internal' (via d_user join)

━━━ LAYER 3: Aggregated Tables (start here for most questions) ━━━

📊 f_user_session — Student/teacher attendance per live session
   Grain: user + session | Scope: user_id | Partition: dt
   Key metrics: learning_time, room_time, active_time, lobby_time, total_messages, total_hand_raise, total_polls_seen/responded
   Tip: Filter user_type='STUDENT' for student queries. Use learning_time (not room_time) for "time studying".

📊 f_user_playback — Playback/recap viewing per student
   Grain: user + playback attempt | Scope: user_id | Partition: dt
   Key metrics: learning_time, max_position_duration, room_duration
   Tip: "Recap" = "Playback" (same thing, different naming internally vs externally).

📊 f_student_activity — Unified student activity across all types
   Grain: user + activity + date | Scope: user_id | Partition: dt
   Types: Course Session, Playback, on-demand mastery, Assessment
   Key metrics: time_spent_learning, time_spent_all
   Tip: Use this for "active students" and "activation" metrics. MCQ/Polls excluded to avoid double-counting.

📊 f_user_segment — Per-user segment breakdown of poll activity within a session
   Grain: user + segment_id (BREAKOUT/LIVE_MASTERY) or user + session (MAIN, segment_id=NULL) | Scope: user_id | Partition: dt
   Key: segment_type, total_polls_answered, poll_accuracy_rate, active_time_mins, active_time_ratio, user_segment_sentiment
   Tip: MAIN segments have segment_id = NULL. Use for per-segment engagement & sentiment analysis.

━━━ LAYER 2: Fact Tables (detailed event/interaction data) ━━━

📋 f_classroom_events — Raw backend events in sessions (MESSAGE, HAND_RAISE, ROOM_JOIN, etc.)
   Grain: each event | Scope: actor_user_id | Partition: dt
   74 event types. Columns: actor_user_id, actedupon_user_id, actedupon_room_id, event_timestamp, useragent, custommetadata (JSON).
   Tip: Use get_json_object(custommetadata, '$.slideid') to extract event metadata fields.

📋 f_client_student_events — Frontend client events on student app/web
   Grain: each event | Scope: user_id | Partition: dt
   Tip: data column is array<struct<type,value>>. Use CROSS JOIN UNNEST(data) to extract. Exclude app_loaded/onboarding_sign_in_clicked (empty data).
   Device info: device.deviceid, device.platform, device.appversion (from device struct). App version: meta.version.

📋 f_user_poll — Polls, MCQs, and On-Demand Mastery questions
   Grain: poll + user (attempt) | Scope: user_id | Partition: dt
   Key filters: poll_type (mcq/poll/on-demand mastery), poll_source, poll_seen=1, poll_answered=1, is_correct_answer
   Tip: Polls deprecated Feb 2025 → all new questions are poll_type='mcq'. MCQ ID ≠ Question ID: join via question_id.

📋 f_user_survey — End-of-session satisfaction surveys
   Grain: user + survey_id + survey_question_id | Scope: user_id | No partition
   Key: survey_template_id=5 for end-of-session reactions. Columns: responded, satisfaction_score, choice, survey_datetime.
   Silent surveys decommissioned July 2025.

📋 f_course_session — Session-level metadata (no user dimension)
   Grain: session | Scope: none (dimension-like) | No partition
   Key: session_temperature (-100 to +100), teaching_time, breakout counts, course_session_status, positive/negative/neutral_users
   Tip: Join to d_course for country. course_session_teacher_id = teacher with longest presence.

📋 f_user_assessment — Assessment/homework question-level results
   Grain: attempt_id (practice_id + session + question) | Scope: user_id | No partition
   Key: is_correct, question_answered, question_seen, duration (seconds), submitted_choice_id, question_order
   Join: d_assessment via practice_assessment_id

📋 f_user_reaction — In-session emoji reactions per slide
   Grain: user + session_slide_id + emotion + part_of_activity | Scope: user_id | Partition: dt
   Emotions: confused, loved, sad, skip, stronger. Flag: part_of_activity (1=during activity).
   Columns: session_slide_id_reaction_made (when clicked), session_slide_id (activity slide for join).

📋 f_transaction_details — Payment transactions
   Grain: transaction_id | Scope: user_id | No partition
   Key: status, paid_amount, paid_amount_usd, gross_amount, voucher_code, is_bundle_virtual, course_ids, end_date

📋 f_user_note — Facilitator notes about students
   Grain: note_id | Scope: notee_user_id | No partition
   Types: GENERAL_STUDENT_NOTE, ONE_ON_ONE_NOTE, SESSION_HEALTH_METRICS

📋 ai_chat_message_labeled_emotions_with_reason — AI-classified chat emotions
   Grain: message_id | Scope: user_id | No partition
   School sessions + students only. Emotions: loved, stronger, sad, confused, neutral. Daily refresh 7AM UTC.

⏱ f_user_activity_feature_duration — Per-user per-activity feature active time
   Database: noon2_datamart | Grain: user_id + course_session_id + session_slide_id | Scope: none | Partition: dt
   Key: feature-level minutes (zoom_in, reaction, stage_time, message, etc.), total_active_mins, n_features_used, segment_total_time_mins.

━━━ RAW SOURCE TABLES (noon2_core — sqooped from production MySQL) ━━━

🔮 prediction — ML model predictions per user for topics and chapters
   Database: noon2_core | Grain: profile_id + entity_type + entity_id + as_of_date | Scope: profile_id | No partition
   entity_type values: TOPIC, CHAPTER. Key: prediction_value, ci_lower, ci_upper. Daily sqoop.
   Tip: profile_id = user_id in datamart tables. Always JOIN prediction_run to filter by trigger_type/model_id.

⚙ prediction_run — Metadata for each prediction model run
   Database: noon2_core | Grain: id | Scope: none | No partition
   Key: trigger_type (CRON/MANUAL), model_id (xgboost/bayesian), status, as_of_date. Daily sqoop.
   Tip: Use trigger_type='CRON' for scheduled production runs; model_id='xgboost' for the primary model.

🏠 room (noon2_core) — Rooms within sessions (main + breakout rooms)
   Database: noon2_core | Grain: room_id | Scope: none | No partition
   Key: course_session_id, room_start_time, room_end_time, is_active. Bridge f_classroom_events to sessions via room_id.

❓ question_explanation (noon2_core) — Explanation text per question
   Database: noon2_core | Grain: id | Scope: none | No partition
   Key: question_id, content. Join to d_question on question_id. Daily sqoop.

🎯 mcq (noon2_core) — MCQ instances within sessions/mastery
   Database: noon2_core | Grain: id | Scope: none | No partition
   Key: question_id (FK → d_question), activity_id, course_session_id. Bridge between questions and session activities.

✅ mcq_selected_choice (noon2_core) — Student MCQ responses (raw level)
   Database: noon2_core | Grain: id | Scope: none | No partition
   Key: mcq_id, profile_id, choice_id, attempt, is_correct. One row per student per MCQ per attempt.

🔗 mcq_selected_choice_choices (noon2_core) — Multi-select MCQ bridge
   Database: noon2_core | Grain: mcq_selected_choice_id + choice_id | No partition
   Bridge for multi-select answers.

━━━ SURVEY TABLES (noon2_core — sqooped) ━━━

📋 survey_template (noon2_core) — Survey template definitions
   Database: noon2_core | Grain: id | Scope: none | No partition
   Key: name, is_active. template_id=5 = end-of-session satisfaction survey. Daily sqoop.

📋 survey (noon2_core) — Survey instances (one per session per template)
   Database: noon2_core | Grain: id | Scope: none | No partition
   Key: survey_template_id, course_session_id, created_by (teacher profile_id). Daily sqoop.
   ⚠ created_by = teacher who launched it, NOT the respondent. Join survey_answer.profile_id for respondent.

📋 survey_question (noon2_core) — Questions within a survey template
   Database: noon2_core | Grain: id | Scope: none | No partition
   Key: survey_template_id, question_text, question_type (CHOICE/SCALE/TEXT), sequence. Daily sqoop.

📋 survey_question_choice (noon2_core) — Answer choices for CHOICE-type survey questions
   Database: noon2_core | Grain: id | Scope: none | No partition
   Key: survey_question_id, choice_text, choice_id, sequence. Daily sqoop.

📋 survey_answer (noon2_core) — Individual survey responses
   Database: noon2_core | Grain: id | Scope: profile_id | No partition
   Key: survey_id, survey_question_id, profile_id (respondent), choice_id, text_answer, scale_value. Daily sqoop.
   ⚠ profile_id here = the student/respondent (NOT survey.created_by).

━━━ FACILITATOR TABLES (noon2_core — sqooped) ━━━

📝 notes (noon2_core) — Facilitator notes about students
   Database: noon2_core | Grain: id | Scope: profile_id | No partition
   Key: profile_id (student), facilitator_id, note_type (GENERAL_STUDENT_NOTE/ONE_ON_ONE_NOTE/SESSION_HEALTH_METRICS), content. Daily sqoop.

🔗 note_task_mapping (noon2_core) — Links notes to task instances
   Database: noon2_core | Grain: id | Scope: none | No partition
   Key: note_id, task_instance_id. Daily sqoop.

📋 task_templates (noon2_core) — Reusable task definitions
   Database: noon2_core | Grain: id | Scope: none | No partition
   Key: title, description, task_type, is_active. Daily sqoop.

⚙ task_instance (noon2_core) — Assigned task instances from templates
   Database: noon2_core | Grain: id | Scope: none | No partition
   Key: task_template_id, assignee_id, assigner_id, status, due_date. Daily sqoop.

━━━ ON-DEMAND MASTERY (ODM) TABLES (noon2_core — sqooped) ━━━

🎯 on_demand_session (noon2_core) — ODM practice sessions initiated by students
   Database: noon2_core | Grain: id | Scope: profile_id | No partition
   Key: profile_id, topic_id, source (e.g., 'Heatmap'), status, started_at. Daily sqoop.
   ⚠ source='Heatmap' = session originated from the Heatmap feature → sets is_heatmap=1 in f_user_poll.

🎯 on_demand_mastery_session (noon2_core) — Mastery session metadata (links ODM session to questions)
   Database: noon2_core | Grain: id | Scope: none | No partition
   Key: on_demand_session_id, mastery_question_id, status, score. Daily sqoop.

❓ mastery_question (noon2_core) — Questions assigned in ODM sessions
   Database: noon2_core | Grain: id | Scope: none | No partition
   Key: question_id, topic_id, difficulty_level. Daily sqoop.

━━━ REFERENCE TABLES (noon2_core — sqooped) ━━━

🔤 choice (noon2_core) — Answer choices for questions
   Database: noon2_core | Grain: id | Scope: none | No partition
   Key: question_id, content, is_correct, sequence. Daily sqoop.
   Tip: Join to d_question on question_id. More detailed than d_question.choice_ids array.

📊 grade (noon2_core) — Grade/year reference table
   Database: noon2_core | Grain: id | Scope: none | No partition
   Key: name, level, country_id, is_deleted. Filter is_deleted=0 for active grades. Daily sqoop.

🏫 campus (noon2_core) — Campus reference table
   Database: noon2_core | Grain: id | Scope: none | No partition
   Key: name, campus_type (UFFUQ/TRACKS/MARKETPLACE), country_id, is_deleted. Filter is_deleted=0. Daily sqoop.

👤 campus_managers (noon2_core) — Mapping of managers to campuses
   Database: noon2_core | Grain: id | Scope: none | No partition
   Key: campus_id, profile_id (manager), role. Daily sqoop.

👤 profile (noon2_core) — Raw user profiles (source of truth for d_user)
   Database: noon2_core | Grain: id | Scope: none | No partition
   Key: account_id, profile_type, country_id, grade_id, status. Daily sqoop.
   ⚠ PII not available here. For email/phone use noon2_core.account (requires explicit justification).

📚 subject (noon2_core) — Subject reference/lookup table
   Database: noon2_core | Grain: id | Scope: none | No partition
   Key: name, color, is_deleted, learning_goal_id. Filter is_deleted=0 for active subjects. Daily sqoop.

📖 chapter (noon2_core) — Chapters within subjects
   Database: noon2_core | Grain: id | Scope: none | No partition
   Key: name, subject_id, sequence_number, is_deleted, is_suitable_for_practice. Filter is_deleted=0. Daily sqoop.
   Tip: FK → noon2_core.subject.id. Note: d_chapter in datamart has richer info (grade/board tags); use noon2_core.chapter for raw hierarchy joins.

📝 topic (noon2_core) — Topics within chapters (finest content unit)
   Database: noon2_core | Grain: id | Scope: none | No partition
   Key: name, chapter_id, sequence_number, is_deleted. Filter is_deleted=0. Daily sqoop.
   Tip: FK → noon2_core.chapter.id. Used in prediction table (entity_type='TOPIC', entity_id=topic.id).

━━━ LAYER 2: Dimension Tables (reference/lookup data) ━━━

👤 d_user — All user profiles (students, teachers, facilitators, etc.)
   Grain: user_id | Scope: user_id
   Key: user_type, campus_id, student_status, country_name, gender, student_grade_id/name
   ⚠ country_name='Noon internal' = company employees → EXCLUDE from student/teacher queries.

📚 d_course — All courses
   Grain: course_id | Scope: none
   Key: course_type (MARKETPLACE/O2O/SCHOOL), teaching_mode, subscription_type, subject_name, grade_names

🏫 d_school_student_courses — School students ↔ cohorts ↔ courses mapping
   Grain: user + cohort + course + grade | Scope: user_id
   Key: cohort_id/name, facilitator_id, facilitator_name, campus_id, campus_name, lane_id/name, country_iso2_code. Only ACTIVE students.

📖 d_chapter — Chapters with subject/grade/board info
   Grain: chapter_id | Scope: none
   Key: subject_image_uri, is_chapter_deleted, is_subject_deleted

❓ d_question — Question bank
   Grain: question_id | Scope: none
   Key: difficulty_level (1-5), question_format, question_format_2, correct_choice_id, choice_ids, total_choices, is_deleted, has_explanation, exam_paper, created_at
   Qudrat classification: use subject_id IN (248, 249, 250). 248=Quant, 249=Verbal, 250=Quant prep. NEVER classify Qudrat by subject_name string matching — this is a known failure mode.
   Note: Single board_id/grade_id/subject_id per question. Filter exam_paper IS NOT NULL for exam-tagged questions.

📝 d_assessment — Assessment/homework metadata
   Grain: practice_assessment_id | Scope: none
   Key: practice_id, board_id, subject_id, chapter_ids, topic_ids, total_questions
   Types: END_OF_CHAPTER, END_OF_SEMESTER, HOMEWORK, QUDRAT_SIMULATOR, TAHSILI_SIMULATOR, MOCK_MISSION
   Homework join chain: d_assessment → noon2_core.assessment_schedule → noon2_core.schedule (is_deleted=0) → noon2_core.school_calendar (entity_type='COURSE') → course_id
   ⭐ For homework completion: use noon2_replit.homework_completion_kyy first (pre-aggregated, starts 2026-01-18)

🎯 d_classroom_activity — Activities within sessions
   Grain: activity_id | Scope: none
   Key: session_class_type, room_ids, mcq_types, planned_duration/duration (seconds)
   Types: CUSTOM, QUESTION, MARATHON, TEAM_DUEL, TEAM_EXERCISE, EXIT_TICKET, etc.

📦 d_bundle — Course bundles for paid access
   Grain: bundle_id | Scope: none
   Key: course_ids, course_ids_all_time, teacher_ids, earliest_course_start_date, latest_course_end_date, is_bundle_virtual

🎯 d_mission — Missions (multi-session learning paths)
   Grain: mission_id | Scope: none
   Key: mission_default_practice_target_for_revision, course_section_name/sequence, subject_id, course_section_chapter_ids, evaluation_practice_assessment_id
   Links: → f_user_assessment via evaluation_practice_assessment_id | → f_user_poll (ODM) via evaluation_id

📅 d_practice_target — Weekly practice targets per course + lane for mission-based courses
   Grain: course_id + course_week_id + lane_id + practice_source_id | Scope: none | Partition: dt
   Types: SESSION (per session) or EVALUATION (per revision). Key: target = lane.multiplier × mission default.

━━━ HOMEWORK SCHEDULING TABLES (noon2_core — sqooped) ━━━

📋 assessment_schedule (noon2_core) — Bridge: assessment ↔ schedule
   Database: noon2_core | Grain: schedule_id + practice_assessment_id | Scope: none | No partition
   FK: schedule_id → noon2_core.schedule.id | practice_assessment_id → d_assessment

📅 schedule (noon2_core) — Calendar entries for homework/classes
   Database: noon2_core | Grain: id | Scope: none | No partition
   Key: school_calendar_id, event_type, start_date, end_date, is_deleted. Always filter is_deleted=0.
   ⚠ start_date/end_date stored as STRING — CAST to timestamp for date comparisons.

🗓 school_calendar (noon2_core) — Links schedule to a course
   Database: noon2_core | Grain: id | Scope: none | No partition
   Key: entity_type ('COURSE'), entity_id (= course_id when entity_type='COURSE').

━━━ REPLIT VIEWS (pre-aggregated canonical sources) ━━━

⭐ homework_completion_kyy (noon2_replit) — CANONICAL homework completion view
   Grain: user_id + subject_id + start_date | Scope: user_id | No partition
   Columns: total_unique_hws, total_unique_hw_completed. ⚠ Data starts 2026-01-18.
   USE THIS FIRST for any homework completion question. Fall back to raw joins only if you need logic not covered here.

📋 kyy_hw_assigned (noon2_replit) — Per-homework granularity view
   Grain: user_id + practice_assessment_id + hw_order | Scope: user_id | No partition
   Key: hw_completed, hw_completed_on_time, hw_completed_late, hw_incompleted, hw_never_attempted, completed_same_day_assigned
   Tip: Filter hw_order = 1 to deduplicate. ⚠ Data starts 2026-01-18.
   Tracks filter for homework: campus_type='TRACKS' AND cohort_name LIKE '%ثانوي%' AND cohort_name NOT LIKE '%قدرات%'

━━━ LESSON BUILDER MODEL (noon2_core — sqooped) ━━━
Content-authoring model: lesson → lesson_version → (segments, activities → questions), tagged by curriculum,
linked to a session and materialized into it. ⚠ All id/*_id are UUID STRINGs (except course_session_id, question_id,
curriculum FKs, created_by, and lesson_session_materialization_mapping.id which are BIGINT). Timestamps are VARCHAR. Filter is_deleted=0.

📘 lesson (noon2_core) — Authored lessons / templates
   Grain: id (UUID) | No partition | Key: name, class_type (LIVE_CLASS/LIVE_MASTERY), lesson_type (HYBRID/ONLINE), is_template, template_key (concept_coverage/practice/revision), is_published, created_by
🧾 lesson_version (noon2_core) — Immutable lesson snapshots
   Grain: id (UUID) | Key: lesson_id, version_number, status (DRAFT/PUBLISHED/ARCHIVED), duration_seconds, source_course_session_id
🔗 lesson_session_link (noon2_core) — Lesson version ↔ course session
   Grain: id (UUID) | Key: lesson_id, lesson_version_id, course_session_id, linked_at, unlinked_at, replaced_by_link_id
🎬 lesson_activity (noon2_core) — Activities within a lesson version
   Grain: id (UUID) | Key: lesson_version_id, activity_index, type (QUESTION/MARATHON/TEAM_DUEL/EXIT_TICKET/…), lesson_slide_id
❓ lesson_activity_question (noon2_core) — Questions on an activity
   Grain: id (UUID) | Key: lesson_activity_id, question_id (→ d_question), question_index
🧭 lesson_curriculum (noon2_core) — Curriculum tags for a lesson
   Grain: id (UUID) | Key: lesson_id, subject_id, chapter_id, topic_id, subtopic_id, concept_id
🧩 lesson_segment (noon2_core) — Pacing segments in a lesson version
   Grain: id (UUID) | Key: lesson_version_id, segment_index, name, duration_seconds, pace
⚙ lesson_session_materialization (noon2_core) — Lesson→session materialization
   Grain: id (UUID) | Key: lesson_version_id, lesson_session_link_id, course_session_id, status (READY/SUPERSEDED), ready_at, error_message
🗺 lesson_session_materialization_mapping (noon2_core) — Lesson ref ↔ session ref (id is BIGINT)
   Grain: id (bigint) | Key: materialization_id, kind, lesson_ref_id, session_ref_id
🔑 lesson_share_link (noon2_core) — Shareable lesson links
   Grain: id (UUID) | Key: lesson_id, lesson_version_id, token, expires_at, revoked_at

━━━ CURATED ANALYST VIEWS (datamart_v & noon2_replit) ━━━
⚠ Defaults STILL apply to all of these — they do NOT pre-filter Nooners/deleted/non-students.

🗂 kyy_nn_session_details (datamart_v) — Session view w/ teacher, subject, campus, temperature, planned vs actual h-duration
   Grain: course_session_id | View | Session-grain: don't GROUP BY campus for session counts (hybrid trap).
🎯 nn_activity_details (datamart_v) — Activity (slide) view: reactions/temperature + question perf (attempted/correct, avg_q_duration)
   Grain: course_session_id + session_slide_id | View | NULL activity_type = reaction-only slide. ⚠ Large — filter by date.
🧪 nn_activity_quality (datamart_v) — Activity quality: difficulty/topic/duration + gamification (duel/BCS invites)
   Grain: course_session_id + session_slide_id | ⚠ Stored view currently FAILS to compile (bad noon2_core.room ref) — probe before use.
📝 nn_assessment_details (noon2_replit) — Assessment perf by program/subject_type/level (Qudrat/Tahsili/Nafes/NC/ESL)
   Grain: profile_id + question_id | Scope: profile_id | View | Metrics: total_questions, total_attempts, total_questions_correct, avg_time_taken
📈 nn_learning_gains (noon2_replit) — Pre/post learning gains per student × program × subject × level
   Grain: user_id | Scope: user_id | View | gain = post_score/post_total_ques − pre_score/pre_total_ques
📊 hk_f_course_session (noon2_replit) — Curated f_course_session rebuild (teaching/session/active time, temperature, spotlight, curriculum arrays, lesson_template)
   Grain: course_session_id | View | No campus col. Filter is_course_session_deleted=0. Array cols → CONTAINS.
👥 hk_f_user_session (noon2_replit) — Curated f_user_session rebuild (learning/room/active/lobby time, poll & engagement counts)
   Grain: user_id + course_session_id | Scope: user_id | Partition: dt (int YYYYMMDD) | Filter user_type='STUDENT'.
❔ hk_session_questions (noon2_replit) — Questions floated in sessions w/ metadata + seen/answered/valid/correct
   Grain: course_session_id + question_id | View | question_type: 'has correct answer' vs 'no correct answer'; segment_type MAIN/BREAKOUT/LIVE_MASTERY
🎙 session_transcriptions (noon2_replit) — Speech-to-text transcript segments (speaker, text, start/end offsets)
   Grain: course_session_id + start_time | View | start_time/end_time are VARCHAR offsets. Text may be sensitive.

━━━ COMMON JOIN PATTERNS ━━━
• Student sessions + user info: f_user_session JOIN d_user ON user_id
• Session + course country: f_course_session JOIN d_course ON course_id → country_names
• Poll + question details: f_user_poll JOIN d_question ON question_id
• Assessment + metadata: f_user_assessment JOIN d_assessment ON practice_assessment_id
• School students + courses: d_school_student_courses (already joined)
• Mission assessments: d_mission JOIN f_user_assessment ON evaluation_practice_assessment_id = practice_assessment_id
• Mission revision: d_mission JOIN f_user_poll ON evaluation_id WHERE poll_type='on-demand mastery'
• Reactions + activities: f_user_reaction JOIN d_classroom_activity ON session_slide_id
• Segment engagement: f_user_segment JOIN f_course_session ON course_session_id
• Homework completion (aggregated): noon2_replit.homework_completion_kyy (start_date >= 2026-01-18)
• Homework assignment chain: d_assessment → noon2_core.assessment_schedule → noon2_core.schedule (is_deleted=0) → noon2_core.school_calendar (entity_type='COURSE') → course_id
• Classroom events → session (via room): f_classroom_events JOIN noon2_core.room ON actedupon_room_id = room_id → course_session_id
• Question explanation: d_question JOIN noon2_core.question_explanation ON question_id
• Survey responses: noon2_core.survey JOIN noon2_core.survey_answer ON id=survey_id → profile_id (respondent)
• Survey answer choices: noon2_core.survey_answer JOIN noon2_core.survey_question_choice ON choice_id
• Facilitator notes → tasks: noon2_core.notes JOIN noon2_core.note_task_mapping ON id=note_id → task_instance_id
• ODM session chain: noon2_core.on_demand_session → on_demand_mastery_session ON id=on_demand_session_id → mastery_question ON mastery_question_id=id
• ODM heatmap origin: on_demand_session.source='Heatmap' → is_heatmap=1 in f_user_poll
• Choice details: d_question JOIN noon2_core.choice ON question_id (for full choice text/correctness)
• Campus lookup: d_user JOIN noon2_core.campus ON campus_id (for campus_type/country details)
• Profile → grade: noon2_core.profile JOIN noon2_core.grade ON grade_id
• MCQ response chain: noon2_core.mcq m JOIN noon2_core.mcq_selected_choice msc ON m.id = msc.mcq_id JOIN noon2_core.choice c ON msc.choice_id = c.id
• Lesson taught in a session: noon2_core.lesson_session_link l ON l.course_session_id = <session> (WHERE l.unlinked_at IS NULL) → lesson_version ON l.lesson_version_id = lesson_version.id → lesson ON lesson_version.lesson_id = lesson.id
• Lesson content: noon2_core.lesson_version JOIN lesson_segment ON lesson_version_id JOIN lesson_activity ON lesson_version_id JOIN lesson_activity_question ON lesson_activity.id = lesson_activity_question.lesson_activity_id (→ d_question ON question_id)
• Lesson curriculum: noon2_core.lesson JOIN lesson_curriculum ON lesson.id = lesson_curriculum.lesson_id (→ subject/chapter/topic)
• Lesson materialization: noon2_core.lesson_session_materialization m (status='READY') JOIN lesson_session_materialization_mapping mm ON m.id = mm.materialization_id
• Session transcript: noon2_replit.session_transcriptions ON course_session_id (ORDER BY CAST-able start_time for chronology)
`;

// Helper to build full schema for only specific tables (Layer 2 selective loading)
export function buildSelectiveSchemaContext(role: string, tableKeys: string[]): string {
  const tables = getVisibleTables(role).filter((t) => tableKeys.includes(t.key));
  if (tables.length === 0) return '';

  const lines: string[] = ['', `─── Full Schema for ${tables.length} Selected Tables ───`, ''];

  for (const t of tables) {
    lines.push(`## ${t.table}`);
    lines.push(`${t.description}`);
    lines.push(
      `Grain: ${t.grain} | Partition: ${t.partition ?? 'none'} | Refresh: ${t.refreshCadence}`,
    );
    if (t.scopeColumn) {
      lines.push(`⚠ Scoped on: ${t.scopeColumn} (auto-filtered by user role)`);
    }
    lines.push('Columns:');
    for (const col of t.columns) {
      let colLine = `  - ${col.name} (${col.type}): ${col.description}`;
      if (col.enumValues && col.enumValues.length > 0) {
        colLine += ` [values: ${col.enumValues.join(' | ')}]`;
      }
      lines.push(colLine);
    }
    if (t.exampleQueries && t.exampleQueries.length > 0) {
      lines.push('Example queries (vetted by analytics team):');
      for (const eq of t.exampleQueries) {
        lines.push('```sql');
        lines.push(eq);
        lines.push('```');
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}
