-- =====================================================================
-- UNIFIED PRODUCTIVITY SYSTEM — D1 SCHEMA
-- Single database, single Worker API, 8 modules.
-- =====================================================================
--
-- CONVENTIONS (apply to every table below unless noted):
--   id            TEXT PRIMARY KEY   -- client-generated UUID, not autoincrement.
--                                     This lets the frontend create records
--                                     offline (local-first) and sync later
--                                     without needing the server to assign IDs.
--   entry_date    TEXT               -- ISO date (YYYY-MM-DD) the activity
--                                     actually happened. Distinct from
--                                     created_at (when it was recorded).
--   created_at    TEXT               -- ISO datetime, set on insert.
--   updated_at    TEXT               -- ISO datetime, set on every update.
--   sync_status   TEXT               -- 'synced' | 'pending' | 'conflict'
--                                     Used by the local-first sync layer.
--                                     Server always sets this to 'synced'
--                                     on successful write; client sets
--                                     'pending' on local-only writes.
--
-- No user_id / auth tables yet — single-user system for now. Adding a
-- users table + user_id FK later is a non-breaking migration (just add
-- the column, default it, backfill). Not worth the complexity today.
--
-- Roadmap milestones do NOT hard-FK into other modules' tables. They
-- reference a (domain, metric_key) pair that the aggregation layer
-- resolves at query time. This means the Workout schema can evolve
-- without ever touching the Roadmap schema. See section 7.
-- =====================================================================


-- =====================================================================
-- 1. BREATH LOG
-- =====================================================================
-- One row per breathing session. Matches your existing 15-min routine:
-- Kapalabhati -> Anulom Vilom -> Box Breathing -> Static Hold -> Recovery.
-- Each phase is optional per-row so partial sessions (skipped a phase,
-- or just did a hold check) still log cleanly.

CREATE TABLE breath_sessions (
    id                  TEXT PRIMARY KEY,
    entry_date          TEXT NOT NULL,
    started_at          TEXT,                   -- ISO datetime, optional precise start
    -- Kapalabhati
    kapalabhati_rounds  INTEGER,
    kapalabhati_exhales_per_round INTEGER,
    -- Anulom Vilom
    anulom_vilom_cycles INTEGER,
    -- Box breathing
    box_breathing_cycles INTEGER,
    box_breathing_count_seconds INTEGER,        -- e.g. 4 for 4-4-4-4
    -- Static breath hold — the primary tracked metric
    hold_exhale_pct     INTEGER,                -- e.g. 30 for "exhale 30% then hold"
    hold_duration_seconds INTEGER,              -- THE number you track weekly
    -- Recovery
    recovery_cycles     INTEGER,
    -- Free text
    notes               TEXT,
    felt_dizzy          INTEGER DEFAULT 0,       -- boolean 0/1, safety flag from your doc
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL,
    sync_status         TEXT NOT NULL DEFAULT 'pending'
);

CREATE INDEX idx_breath_sessions_date ON breath_sessions(entry_date);


-- =====================================================================
-- 2. WORKOUT & TRAINING JOURNAL
-- =====================================================================
-- Three sub-shapes because your training isn't one kind of activity:
--   (a) sessions       — the container (a swim, a calisthenics block, a jog)
--   (b) exercise_sets  — structured sets/reps/weight within a session
--   (c) body_metrics   — weight, knee pain, calalisthenics STAGE progress
--                         (stage tracking is not the same shape as sets/reps
--                          — "Stage 4 knee push-ups, 3x10" is a milestone
--                          within the exercise, logged alongside the session
--                          it happened in)

CREATE TABLE workout_sessions (
    id              TEXT PRIMARY KEY,
    entry_date      TEXT NOT NULL,
    session_type    TEXT NOT NULL,      -- 'swim' | 'calisthenics' | 'jog_walk' | 'combat' | 'mobility' | 'other'
    duration_minutes INTEGER,
    knee_pain_score INTEGER,            -- 0-10, per your doc's weekly tracking rule
    knee_support_worn INTEGER DEFAULT 1, -- boolean, safety compliance tracking
    notes           TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    sync_status     TEXT NOT NULL DEFAULT 'pending'
);

CREATE TABLE workout_exercise_sets (
    id              TEXT PRIMARY KEY,
    session_id      TEXT NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
    exercise_name   TEXT NOT NULL,       -- 'push-up', 'pull-up', 'dip', 'plank', 'freestyle laps', etc.
    exercise_stage  TEXT,                -- e.g. 'Stage 4 — Knee Push-ups' — free text, matches your doc's stage names
    set_number      INTEGER,
    reps            INTEGER,
    hold_seconds    INTEGER,             -- for planks, dead hangs, negatives timed by hold
    weight_kg       REAL,                -- null for bodyweight
    distance_meters INTEGER,             -- for swim laps, jog distance
    created_at      TEXT NOT NULL
);

CREATE INDEX idx_workout_sessions_date ON workout_sessions(entry_date);
CREATE INDEX idx_workout_sessions_type ON workout_sessions(session_type);
CREATE INDEX idx_exercise_sets_session ON workout_exercise_sets(session_id);
CREATE INDEX idx_exercise_sets_name ON workout_exercise_sets(exercise_name);

-- Body weight is logged independently of a "session" — you might weigh in
-- on a rest day. Kept as its own tiny table rather than jammed into sessions.
CREATE TABLE body_metrics (
    id              TEXT PRIMARY KEY,
    entry_date      TEXT NOT NULL,
    weight_kg       REAL,
    notes           TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    sync_status     TEXT NOT NULL DEFAULT 'pending'
);

CREATE INDEX idx_body_metrics_date ON body_metrics(entry_date);


-- =====================================================================
-- 3. MEAL TRACKER
-- =====================================================================
-- One row per meal (not per day) so you can log breakfast/lunch/snack/
-- dinner independently through the day, matching your doc's 5-slot
-- structure. Adherence is a simple self-rated flag, not a calorie
-- calculator — your plan is built around meal *templates*, not
-- macro math, so this stays fast to log on a bus or at a desk.

CREATE TABLE meal_entries (
    id              TEXT PRIMARY KEY,
    entry_date      TEXT NOT NULL,
    meal_slot       TEXT NOT NULL,      -- 'pre_workout' | 'breakfast' | 'lunch' | 'snack' | 'dinner' | 'before_bed'
    description     TEXT,               -- what was actually eaten
    followed_plan   INTEGER,            -- boolean 0/1 — did this match your template for the slot
    protein_included INTEGER DEFAULT 1, -- boolean — quick check against your "protein every meal" rule
    notes           TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    sync_status     TEXT NOT NULL DEFAULT 'pending'
);

CREATE INDEX idx_meal_entries_date ON meal_entries(entry_date);
CREATE INDEX idx_meal_entries_slot ON meal_entries(meal_slot);

-- Water intake tracked separately since it's a running daily total,
-- not a discrete meal event.
CREATE TABLE water_intake (
    id              TEXT PRIMARY KEY,
    entry_date      TEXT NOT NULL,
    liters          REAL NOT NULL,
    created_at      TEXT NOT NULL,
    sync_status     TEXT NOT NULL DEFAULT 'pending'
);

CREATE INDEX idx_water_intake_date ON water_intake(entry_date);


-- =====================================================================
-- 4. LANGUAGES
-- =====================================================================
-- Two shapes, matching the distinction from our discussion:
--   (a) languages          — the slow-moving milestone row per language
--                             (target %, current %, deadline) — this is
--                             what Roadmap reads from
--   (b) language_activity_log — fast daily counters (Anki cards, Pimsleur
--                             lesson done, shadowing minutes)

CREATE TABLE languages (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL UNIQUE,   -- 'Hindi', 'Spanish', 'Tamil', etc.
    tier            TEXT,                   -- 'tier_1_core' | 'tier_2_strategic' | 'tier_3_cultural' | 'tier_4_indian_hobby'
    classification  TEXT,                   -- 'serious' | 'hobby' — per your doc's explicit distinction
    target_pct      INTEGER,                -- e.g. 80 for "80% fluency"
    current_pct     INTEGER DEFAULT 0,
    target_date     TEXT,                   -- ISO date, if a deadline exists
    is_active        INTEGER DEFAULT 1,     -- currently being actively studied (max 2 at once, per your rule)
    notes           TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

CREATE TABLE language_activity_log (
    id              TEXT PRIMARY KEY,
    language_id     TEXT NOT NULL REFERENCES languages(id) ON DELETE CASCADE,
    entry_date      TEXT NOT NULL,
    activity_type   TEXT NOT NULL,      -- 'anki' | 'pimsleur' | 'shadowing' | 'media' | 'conversation' | 'reading'
    anki_cards_reviewed INTEGER,
    pimsleur_lesson_number INTEGER,
    duration_minutes INTEGER,
    notes           TEXT,
    created_at      TEXT NOT NULL,
    sync_status     TEXT NOT NULL DEFAULT 'pending'
);

CREATE INDEX idx_language_activity_date ON language_activity_log(entry_date);
CREATE INDEX idx_language_activity_lang ON language_activity_log(language_id);


-- =====================================================================
-- 5. WORK-LOG (WORK JOURNAL)
-- =====================================================================
-- Daily entries about your actual job — separate from Engineering
-- self-study (that's a Roadmap phase + LeetCode/project tracking,
-- see section 7). This table is about work-work: tasks, hours, notes.

CREATE TABLE work_log_entries (
    id              TEXT PRIMARY KEY,
    entry_date      TEXT NOT NULL,
    work_mode       TEXT,               -- 'office' | 'wfh'
    hours_logged    REAL,
    tasks_summary   TEXT,
    blockers        TEXT,
    notes           TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    sync_status     TEXT NOT NULL DEFAULT 'pending'
);

CREATE INDEX idx_work_log_date ON work_log_entries(entry_date);

-- Engineering self-study gets its own small log — LeetCode problems,
-- course progress, GitHub commits — since it's tracked with specific
-- counters in your doc (50+ problems, MOOC.fi parts, etc.) distinct
-- from day-job hours above.
CREATE TABLE engineering_activity_log (
    id                  TEXT PRIMARY KEY,
    entry_date          TEXT NOT NULL,
    activity_type       TEXT NOT NULL,   -- 'leetcode' | 'course' | 'project_build' | 'reading' | 'github_commit'
    leetcode_problems_solved INTEGER,
    leetcode_difficulty TEXT,            -- 'easy' | 'medium' | 'hard'
    course_name         TEXT,
    duration_minutes    INTEGER,
    notes                TEXT,
    created_at           TEXT NOT NULL,
    sync_status          TEXT NOT NULL DEFAULT 'pending'
);

CREATE INDEX idx_engineering_activity_date ON engineering_activity_log(entry_date);


-- =====================================================================
-- 6. HOBBIES LOG
-- =====================================================================
-- Four distinct hobby types from your doc, each with a different
-- primary metric. Rather than one rigid table with mostly-null
-- columns, this uses a shared container + a JSON metrics blob for
-- the hobby-specific number, since the shapes genuinely differ
-- (deck time vs WPM vs constellation count vs project stage).

CREATE TABLE hobby_sessions (
    id              TEXT PRIMARY KEY,
    entry_date      TEXT NOT NULL,
    hobby_type      TEXT NOT NULL,      -- 'memory' | 'morse' | 'celestial' | 'electronics'
    -- Memory training
    memory_deck_time_seconds INTEGER,   -- time to memorize a full shuffled deck
    memory_accuracy_pct INTEGER,        -- for partial/practice attempts
    -- Morse code
    morse_wpm       INTEGER,            -- words per minute, current tested speed
    morse_characters_known INTEGER,
    -- Celestial navigation
    constellations_identified TEXT,     -- comma-separated or JSON array of names
    -- Electronics
    electronics_project_name TEXT,
    electronics_project_stage TEXT,     -- free text, e.g. 'Arduino project 3 of 10'
    -- Shared
    duration_minutes INTEGER,
    notes           TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    sync_status     TEXT NOT NULL DEFAULT 'pending'
);

CREATE INDEX idx_hobby_sessions_date ON hobby_sessions(entry_date);
CREATE INDEX idx_hobby_sessions_type ON hobby_sessions(hobby_type);


-- =====================================================================
-- 7. ROADMAP + FOCUS
-- =====================================================================
-- This is the milestone/target layer sitting above modules 1-6.
-- Deliberately loose coupling: roadmap_milestones does NOT foreign-key
-- into workout_sessions or breath_sessions etc. It references a
-- (domain, metric_key) pair. The aggregation query (in the Worker API,
-- not the DB) knows how to resolve e.g. metric_key = 'body_weight_kg'
-- by querying body_metrics, or metric_key = 'breath_hold_seconds' by
-- querying breath_sessions. This means adding a new metric later is
-- a Worker code change, not a schema migration.

CREATE TABLE roadmap_domains (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL UNIQUE,   -- 'Fitness', 'Diet', 'Engineering', 'Languages', 'Combat Sports', 'Hobbies'
    description     TEXT,
    created_at      TEXT NOT NULL
);

CREATE TABLE roadmap_phases (
    id              TEXT PRIMARY KEY,
    domain_id       TEXT NOT NULL REFERENCES roadmap_domains(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,           -- 'Phase 1 — Core Foundation', 'Phase A1 — Boxing Foundation'
    phase_order     INTEGER,                 -- for sorting Phase 1, 2, 3...
    start_date      TEXT,
    target_end_date TEXT,
    actual_end_date TEXT,
    status          TEXT NOT NULL DEFAULT 'not_started', -- 'not_started' | 'in_progress' | 'complete'
    description     TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

CREATE TABLE roadmap_milestones (
    id              TEXT PRIMARY KEY,
    phase_id        TEXT REFERENCES roadmap_phases(id) ON DELETE CASCADE,
    domain_id       TEXT NOT NULL REFERENCES roadmap_domains(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,           -- '105 kg', 'First full push-up', 'Breath hold 90 seconds'
    metric_key      TEXT,                    -- 'body_weight_kg' | 'breath_hold_seconds' | 'pushup_stage' | etc.
                                              -- NULL if this milestone isn't auto-tracked (manually checked off)
    target_value    REAL,                    -- e.g. 105 (kg) or 90 (seconds)
    comparison      TEXT DEFAULT 'lte',      -- 'lte' | 'gte' | 'eq' — how target_value is evaluated against logged data
    target_date     TEXT,
    status          TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'in_progress' | 'achieved'
    achieved_date   TEXT,
    achieved_value  REAL,                    -- snapshot of the actual value when marked achieved
    notes           TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

CREATE INDEX idx_roadmap_phases_domain ON roadmap_phases(domain_id);
CREATE INDEX idx_roadmap_milestones_phase ON roadmap_milestones(phase_id);
CREATE INDEX idx_roadmap_milestones_domain ON roadmap_milestones(domain_id);
CREATE INDEX idx_roadmap_milestones_status ON roadmap_milestones(status);

-- Focus timer — kept generic/untagged per your call to revisit later.
-- domain_id is nullable and unused for now; adding domain-tagging later
-- is just "start populating this column," not a schema change.
CREATE TABLE focus_sessions (
    id              TEXT PRIMARY KEY,
    entry_date      TEXT NOT NULL,
    started_at      TEXT NOT NULL,
    ended_at        TEXT,
    duration_minutes INTEGER,
    domain_id       TEXT REFERENCES roadmap_domains(id),  -- nullable, unused for now
    label           TEXT,                    -- free-text label if user wants to note what they focused on
    notes           TEXT,
    created_at      TEXT NOT NULL,
    sync_status     TEXT NOT NULL DEFAULT 'pending'
);

CREATE INDEX idx_focus_sessions_date ON focus_sessions(entry_date);


-- =====================================================================
-- 8. OVERALL STATS
-- =====================================================================
-- No tables. This module is pure read-side aggregation across the
-- 7 tables above, computed in the Worker API (or as SQL VIEWs — see
-- below for a couple of examples that are cheap to maintain in D1).
-- Kept as VIEWs rather than materialized tables so there's never a
-- staleness/sync problem for derived data.

-- NOTE: D1's SQLite build enforces a lower "too many terms in compound
-- SELECT" limit than desktop SQLite, so the naive 7-way UNION-of-UNIONs
-- approach (that works fine in plain sqlite3) fails on D1. This version
-- avoids UNION entirely: a recursive date-series generator produces every
-- calendar date in range, and each module's count is a correlated
-- subquery against that series. Same output shape, no compound SELECT.
CREATE VIEW IF NOT EXISTS v_daily_activity_summary AS
WITH RECURSIVE date_series(entry_date) AS (
    SELECT date('now', '-365 days')
    UNION ALL
    SELECT date(entry_date, '+1 day')
    FROM date_series
    WHERE entry_date < date('now')
)
SELECT
    d.entry_date,
    (SELECT COUNT(*) FROM breath_sessions b WHERE b.entry_date = d.entry_date) AS breath_sessions_count,
    (SELECT COUNT(*) FROM workout_sessions w WHERE w.entry_date = d.entry_date) AS workout_sessions_count,
    (SELECT COUNT(*) FROM meal_entries m WHERE m.entry_date = d.entry_date) AS meals_logged_count,
    (SELECT COUNT(*) FROM language_activity_log l WHERE l.entry_date = d.entry_date) AS language_activities_count,
    (SELECT COUNT(*) FROM work_log_entries wl WHERE wl.entry_date = d.entry_date) AS work_log_entries_count,
    (SELECT COUNT(*) FROM hobby_sessions h WHERE h.entry_date = d.entry_date) AS hobby_sessions_count,
    (SELECT COUNT(*) FROM focus_sessions f WHERE f.entry_date = d.entry_date) AS focus_sessions_count
FROM date_series d;


CREATE VIEW IF NOT EXISTS v_latest_body_weight AS
SELECT weight_kg, entry_date
FROM body_metrics
WHERE weight_kg IS NOT NULL
ORDER BY entry_date DESC
LIMIT 1;

CREATE VIEW IF NOT EXISTS v_latest_breath_hold AS
SELECT hold_duration_seconds, entry_date
FROM breath_sessions
WHERE hold_duration_seconds IS NOT NULL
ORDER BY entry_date DESC
LIMIT 1;
