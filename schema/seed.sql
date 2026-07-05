-- =====================================================================
-- SEED DATA — Languages, Roadmap Domains, and initial Milestones
-- =====================================================================
-- Source: "Master Life Plan v3.0" doc, Parts 3, 4, 6, 7, 8, 9, 12.
-- Every value below is pulled directly from that doc, not invented.
-- Where a number came from is noted in the row comment so it can be
-- checked against the source later if the plan doc itself changes.
--
-- Idempotent: uses INSERT OR IGNORE keyed on natural-unique columns
-- (languages.name is UNIQUE; domains matched by name before insert)
-- so re-running this script after partial application won't create
-- duplicates or error out.
-- =====================================================================


-- =====================================================================
-- LANGUAGES  (Part 7 — 13 languages across 4 tiers, not 9 as earlier
-- miscounted in conversation — Tier 1: 3, Tier 2: 4, Tier 3: 3, Tier 4: 4)
-- =====================================================================

-- Tier 1 — Core (Now through end of 2027)
INSERT OR IGNORE INTO languages (id, name, tier, classification, target_pct, current_pct, target_date, is_active, notes, created_at, updated_at)
VALUES
  (lower(hex(randomblob(16))), 'English', 'tier_1_core', 'serious', 100, 0, '2026-12-31', 1,
   'Primary career language. Target: effortlessly professional by end of 2026.', datetime('now'), datetime('now')),
  (lower(hex(randomblob(16))), 'Hindi', 'tier_1_core', 'serious', 80, 0, '2026-12-31', 1,
   'Pimsleur daily. Target: full 10-minute conversation comfortably by end of 2026.', datetime('now'), datetime('now')),
  (lower(hex(randomblob(16))), 'Spanish', 'tier_1_core', 'serious', 70, 0, '2027-12-31', 0,
   'Starts after Hindi reaches 60% (~mid-2027). Language Transfer Spanish.', datetime('now'), datetime('now'));

-- Tier 2 — Strategic (2028-2029)
INSERT OR IGNORE INTO languages (id, name, tier, classification, target_pct, current_pct, target_date, is_active, notes, created_at, updated_at)
VALUES
  (lower(hex(randomblob(16))), 'Mandarin', 'tier_2_strategic', 'serious', 50, 0, '2029-12-31', 0,
   'Serious use — technology and manufacturing.', datetime('now'), datetime('now')),
  (lower(hex(randomblob(16))), 'Japanese', 'tier_2_strategic', 'serious', 60, 0, '2029-12-31', 0,
   'Serious use — significant tech industry presence.', datetime('now'), datetime('now')),
  (lower(hex(randomblob(16))), 'Russian', 'tier_2_strategic', 'serious', 60, 0, '2029-12-31', 0,
   'Serious use — strong in mathematics and theoretical CS.', datetime('now'), datetime('now')),
  (lower(hex(randomblob(16))), 'Arabic', 'tier_2_strategic', 'serious', 50, 0, '2029-12-31', 0,
   'Serious use — one of six official UN languages, 22 countries.', datetime('now'), datetime('now'));

-- Tier 3 — Cultural (2030 and beyond)
INSERT OR IGNORE INTO languages (id, name, tier, classification, target_pct, current_pct, target_date, is_active, notes, created_at, updated_at)
VALUES
  (lower(hex(randomblob(16))), 'Korean', 'tier_3_cultural', 'serious', 50, 0, NULL, 0,
   'Serious use — growing tech industry, cultural soft power.', datetime('now'), datetime('now')),
  (lower(hex(randomblob(16))), 'German', 'tier_3_cultural', 'serious', 50, 0, NULL, 0,
   'Serious use — engineering capital of Europe.', datetime('now'), datetime('now')),
  (lower(hex(randomblob(16))), 'French', 'tier_3_cultural', 'hobby', 50, 0, NULL, 0,
   'Explicitly brain-training hobby per plan doc — no career pressure, no deadline.', datetime('now'), datetime('now'));

-- Tier 4 — Indian languages, ongoing brain training (no formal deadline pressure)
INSERT OR IGNORE INTO languages (id, name, tier, classification, target_pct, current_pct, target_date, is_active, notes, created_at, updated_at)
VALUES
  (lower(hex(randomblob(16))), 'Tamil', 'tier_4_indian_hobby', 'hobby', 70, 0, NULL, 0,
   'Home language — maintain naturally through daily life.', datetime('now'), datetime('now')),
  (lower(hex(randomblob(16))), 'Telugu', 'tier_4_indian_hobby', 'hobby', 60, 0, NULL, 0,
   'Most widely spoken South Indian language by population.', datetime('now'), datetime('now')),
  (lower(hex(randomblob(16))), 'Kannada', 'tier_4_indian_hobby', 'hobby', 60, 0, NULL, 0,
   'Bangalore, India''s tech capital, runs in Kannada.', datetime('now'), datetime('now')),
  (lower(hex(randomblob(16))), 'Malayalam', 'tier_4_indian_hobby', 'hobby', 60, 0, NULL, 0,
   'Most complex script in India — excellent brain training.', datetime('now'), datetime('now'));


-- =====================================================================
-- ROADMAP DOMAINS  (6 domains matching your module split: Roadmap owns
-- milestones, Workout/Meal/Hobbies/Work-log own the daily logging)
-- =====================================================================

INSERT OR IGNORE INTO roadmap_domains (id, name, description, created_at)
VALUES
  ('dom-fitness', 'Fitness', 'Body transformation: weight, calisthenics, swimming, freediving. Daily training logged in Workout module.', datetime('now')),
  ('dom-diet', 'Diet', 'Weight-loss trajectory and nutrition targets. Daily meals logged in Meal Tracker module.', datetime('now')),
  ('dom-engineering', 'Engineering', 'Java/DSA -> Backend/DB -> AI -> AWS -> Advanced Systems roadmap. Daily study logged in Work-log module.', datetime('now')),
  ('dom-languages', 'Languages', 'Per-language progress tracked in the Languages module (target_pct/current_pct/deadline). This domain groups language-related milestones only.', datetime('now')),
  ('dom-combat', 'Combat Sports', 'Boxing -> Muay Thai -> Kickboxing, starting 2027. Sessions logged in Workout module (session_type: combat).', datetime('now')),
  ('dom-hobbies', 'Intellectual Hobbies', 'Memory training, Morse code, Celestial navigation, Electronics. Daily sessions logged in Hobbies Log module.', datetime('now'));


-- =====================================================================
-- ROADMAP PHASES  (per domain, matching the doc's actual phase names
-- and rough date ranges)
-- =====================================================================

-- Fitness phases (Part 4)
INSERT OR IGNORE INTO roadmap_phases (id, domain_id, name, phase_order, start_date, target_end_date, status, description, created_at, updated_at)
VALUES
  ('phase-fit-0', 'dom-fitness', 'Phase 0 — Recovery (no training, diet + breathing only)', 0, '2026-06-01', '2026-08-31', 'in_progress',
   'No physical training. Diet begins immediately. Doctor clearance expected end of August 2026.', datetime('now'), datetime('now')),
  ('phase-fit-1', 'dom-fitness', 'Phase 1 — Foundation calisthenics (walk -> light jog, wall push-ups -> knee push-ups)', 1, '2026-09-01', '2026-11-30', 'not_started',
   'Full plan begins after doctor clearance. Brisk walk, swimming daily, DEXA baseline.', datetime('now'), datetime('now')),
  ('phase-fit-2', 'dom-fitness', 'Phase 2 — Building (negatives, plyometrics begin)', 2, '2026-11-01', '2027-01-31', 'not_started',
   'Negative push-ups/pull-ups, pogo hops, broad jumps, jump rope.', datetime('now'), datetime('now')),
  ('phase-fit-3', 'dom-fitness', 'Phase 3 — Power (full push-up/pull-up, box jumps, depth drops)', 3, '2027-01-01', '2027-03-31', 'not_started',
   'Full push-ups build 1->20, first pull-up, box jumps, sprint bursts.', datetime('now'), datetime('now')),
  ('phase-fit-4', 'dom-fitness', 'Phase 4 — Athletic (parkour-level movement, high impact landing)', 4, '2027-03-01', NULL, 'not_started',
   'Push-up variations, multiple pull-ups, depth drops from 4-5 feet, full sprint sessions.', datetime('now'), datetime('now'));

-- Engineering phases (Part 6)
INSERT OR IGNORE INTO roadmap_phases (id, domain_id, name, phase_order, start_date, target_end_date, status, description, created_at, updated_at)
VALUES
  ('phase-eng-1', 'dom-engineering', 'Phase 1 — Core Foundation (Java, Python basics, DSA, PostgreSQL, REST)', 1, '2026-09-01', '2027-02-28', 'not_started',
   'Milestone: build a working API from scratch, connect to PostgreSQL, explain every line clearly.', datetime('now'), datetime('now')),
  ('phase-eng-2', 'dom-engineering', 'Phase 2 — Backend + Deployment (Spring Boot, JWT, Docker, AWS basics)', 2, '2027-03-01', '2027-08-31', 'not_started',
   'Deploy at least one application to AWS, live on the internet.', datetime('now'), datetime('now')),
  ('phase-eng-3', 'dom-engineering', 'Phase 3 — AI Integration (RAG, agents, pgvector, n8n)', 3, '2027-09-01', '2028-03-31', 'not_started',
   'AI chatbot with memory, document search with RAG, AI-powered app with payments.', datetime('now'), datetime('now')),
  ('phase-eng-4', 'dom-engineering', 'Phase 4 — Advanced Systems (Terraform, multi-agent AI, LLMOps)', 4, '2028-01-01', '2029-12-31', 'not_started',
   'Multi-agent AI system, full production CI/CD, infrastructure as code.', datetime('now'), datetime('now')),
  ('phase-eng-5', 'dom-engineering', 'Phase 5 — Top Company Preparation (System design, 300-500 LeetCode hards)', 5, '2029-01-01', '2030-12-31', 'not_started',
   'FAANG-level interview readiness.', datetime('now'), datetime('now'));

-- Combat sports phases (Part 8)
INSERT OR IGNORE INTO roadmap_phases (id, domain_id, name, phase_order, start_date, target_end_date, status, description, created_at, updated_at)
VALUES
  ('phase-combat-a1', 'dom-combat', 'Phase A1 — Boxing Foundation', 1, '2027-01-01', NULL, 'not_started',
   'Begins 2027, below 95kg. 12-18 months before Muay Thai. 2-3 sessions/week.', datetime('now'), datetime('now')),
  ('phase-combat-a2', 'dom-combat', 'Phase A2 — Muay Thai', 2, '2028-01-01', NULL, 'not_started',
   'After 12-18 months solid boxing. Kicks, elbows, knees, clinch.', datetime('now'), datetime('now')),
  ('phase-combat-a3', 'dom-combat', 'Phase A3 — Kickboxing', 3, '2029-01-01', NULL, 'not_started',
   'Synthesis of boxing + Muay Thai after 12 months Muay Thai.', datetime('now'), datetime('now'));


-- =====================================================================
-- ROADMAP MILESTONES  (specific numbers pulled directly from Part 12
-- master timeline and each domain's detailed section)
-- =====================================================================

-- Fitness milestones — auto-tracked via metric_key against body_metrics
-- and workout_exercise_sets (resolver logic in worker/src/routes/roadmap.ts)
INSERT OR IGNORE INTO roadmap_milestones (id, phase_id, domain_id, name, metric_key, target_value, comparison, target_date, status, created_at, updated_at)
VALUES
  ('mil-weight-105', 'phase-fit-1', 'dom-fitness', '105 kg', 'body_weight_kg', 105, 'lte', '2026-11-30', 'pending', datetime('now'), datetime('now')),
  ('mil-weight-100', 'phase-fit-1', 'dom-fitness', '100 kg', 'body_weight_kg', 100, 'lte', '2026-12-31', 'pending', datetime('now'), datetime('now')),
  ('mil-weight-93', 'phase-fit-2', 'dom-fitness', '93-95 kg', 'body_weight_kg', 95, 'lte', '2027-03-31', 'pending', datetime('now'), datetime('now')),
  ('mil-weight-90', 'phase-fit-3', 'dom-fitness', '90 kg', 'body_weight_kg', 90, 'lte', '2027-04-30', 'pending', datetime('now'), datetime('now')),
  ('mil-weight-85', 'phase-fit-4', 'dom-fitness', '83-85 kg target range', 'body_weight_kg', 85, 'lte', '2027-06-30', 'pending', datetime('now'), datetime('now')),
  ('mil-pushup-1', 'phase-fit-2', 'dom-fitness', 'First full push-up', 'pushup_max_reps', 1, 'gte', '2026-12-31', 'pending', datetime('now'), datetime('now')),
  ('mil-pullup-1', 'phase-fit-3', 'dom-fitness', 'First full pull-up', 'pullup_max_reps', 1, 'gte', '2027-02-28', 'pending', datetime('now'), datetime('now')),
  ('mil-breathhold-90', 'phase-fit-1', 'dom-fitness', 'Breath hold 90 seconds', 'breath_hold_seconds', 90, 'gte', '2026-12-31', 'pending', datetime('now'), datetime('now')),
  ('mil-breathhold-120', 'phase-fit-2', 'dom-fitness', 'Breath hold 2 minutes', 'breath_hold_seconds', 120, 'gte', '2027-03-31', 'pending', datetime('now'), datetime('now')),
  ('mil-breathhold-180', NULL, 'dom-fitness', 'Breath hold 3+ minutes', 'breath_hold_seconds', 180, 'gte', '2027-04-30', 'pending', datetime('now'), datetime('now'));

-- Diet milestone — manual (not auto-tracked via metric_key, since "5-8kg
-- lost through diet alone" is really the same body_weight_kg metric
-- already covered by mil-weight-105/100 above; recording this one as
-- manual/NULL metric_key avoids two milestones racing to resolve the
-- same underlying number differently).
INSERT OR IGNORE INTO roadmap_milestones (id, phase_id, domain_id, name, metric_key, target_value, comparison, target_date, status, notes, created_at, updated_at)
VALUES
  ('mil-diet-5to8kg', NULL, 'dom-diet', '5-8 kg lost through diet alone', NULL, NULL, NULL, '2026-08-31', 'pending',
   'Tracked via the same body_weight_kg data as the Fitness milestones above — this entry marks the diet-specific checkpoint date from the plan.', datetime('now'), datetime('now'));

-- Engineering milestones
INSERT OR IGNORE INTO roadmap_milestones (id, phase_id, domain_id, name, metric_key, target_value, comparison, target_date, status, notes, created_at, updated_at)
VALUES
  ('mil-eng-phase1-api', 'phase-eng-1', 'dom-engineering', 'First working API built (Phase 1 complete)', NULL, NULL, NULL, '2027-02-28', 'pending',
   'Manual milestone — "can build a working API from scratch, connect to PostgreSQL, explain every line."', datetime('now'), datetime('now')),
  ('mil-eng-leetcode-50', 'phase-eng-1', 'dom-engineering', '50+ LeetCode easy problems solved', 'leetcode_total_solved', 50, 'gte', '2026-08-31', 'pending', NULL, datetime('now'), datetime('now')),
  ('mil-eng-aws-deploy', 'phase-eng-2', 'dom-engineering', 'First application deployed live to AWS', NULL, NULL, NULL, '2027-08-31', 'pending', NULL, datetime('now'), datetime('now')),
  ('mil-eng-leetcode-hard', 'phase-eng-5', 'dom-engineering', '300-500 LeetCode mediums/hards solved', 'leetcode_total_solved', 300, 'gte', '2030-12-31', 'pending', NULL, datetime('now'), datetime('now'));

-- Hobbies milestones
INSERT OR IGNORE INTO roadmap_milestones (id, phase_id, domain_id, name, metric_key, target_value, comparison, target_date, status, created_at, updated_at)
VALUES
  ('mil-hobby-deck-10min', NULL, 'dom-hobbies', 'Memorize a shuffled deck in under 10 minutes', 'memory_deck_time_seconds', 600, 'lte', '2027-03-31', 'pending', datetime('now'), datetime('now')),
  ('mil-hobby-deck-5min', NULL, 'dom-hobbies', 'Memorize a shuffled deck in under 5 minutes', 'memory_deck_time_seconds', 300, 'lte', '2028-08-31', 'pending', datetime('now'), datetime('now')),
  ('mil-hobby-morse-15wpm', NULL, 'dom-hobbies', 'Morse code — 15 words per minute', 'morse_wpm', 15, 'gte', '2026-12-31', 'pending', datetime('now'), datetime('now')),
  ('mil-hobby-morse-20wpm', NULL, 'dom-hobbies', 'Morse code — 20+ words per minute', 'morse_wpm', 20, 'gte', '2028-01-31', 'pending', datetime('now'), datetime('now'));

-- Combat sports milestone (manual — no clean numeric metric to auto-track;
-- "start boxing" is a status/date event, not a measurable log value)
INSERT OR IGNORE INTO roadmap_milestones (id, phase_id, domain_id, name, metric_key, target_value, comparison, target_date, status, notes, created_at, updated_at)
VALUES
  ('mil-combat-boxing-start', 'phase-combat-a1', 'dom-combat', 'Begin boxing training', NULL, NULL, NULL, '2027-01-01', 'pending',
   'Prerequisite: below 95kg. Manual milestone — mark achieved when first session is attended.', datetime('now'), datetime('now'));
