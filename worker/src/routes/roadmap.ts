// =====================================================================
// ROADMAP ROUTES
// =====================================================================
// Domains and Phases use the generic CRUD factory — they're simple
// reference/hierarchy data. Milestones are hand-written because
// "get milestone progress" needs the resolver logic below: given a
// milestone's metric_key, find where that data actually lives (which
// table, which column) and compute current progress against the target.
//
// This resolver is the ONE place in the whole system that knows
// "body_weight_kg lives in body_metrics.weight_kg". If a new metric_key
// needs support, it's added here as one new case — no schema change,
// no changes to the module that logs the underlying data.

import { createCrudHandlers, jsonResponse } from "../lib/crud";
import type { Env } from "../lib/auth";

// roadmap_domains is truly static reference data (Fitness, Engineering,
// Languages, etc.) — 6 rows total, seeded once, essentially never
// edited after setup. No updated_at, no sync_status, no entry_date
// in the schema — sort alphabetically by name.
export const domainHandlers = createCrudHandlers({
  tableName: "roadmap_domains",
  writableColumns: ["name", "description"],
  hasUpdatedAt: false,
  hasSyncStatus: false,
  hasEntryDate: false,
  defaultSortColumn: "name",
});

// roadmap_phases and roadmap_milestones DO get edited over time
// (status changes, dates shift, target values adjusted) so they have
// updated_at — but they're not offline-first mobile log data, so no
// sync_status column, and no entry_date since they're not daily logs
// either. Sort by phase_order (a domain's phases in sequence) and
// target_date (soonest milestone first) respectively — these are
// more useful default orderings than an arbitrary column would be.
export const phaseHandlers = createCrudHandlers({
  tableName: "roadmap_phases",
  writableColumns: [
    "domain_id",
    "name",
    "phase_order",
    "start_date",
    "target_end_date",
    "actual_end_date",
    "status",
    "description",
  ],
  hasSyncStatus: false,
  hasEntryDate: false,
  defaultSortColumn: "phase_order",
});

export const milestoneHandlers = createCrudHandlers({
  tableName: "roadmap_milestones",
  writableColumns: [
    "phase_id",
    "domain_id",
    "name",
    "metric_key",
    "target_value",
    "comparison",
    "target_date",
    "status",
    "achieved_date",
    "achieved_value",
    "notes",
  ],
  hasSyncStatus: false,
  hasEntryDate: false,
  defaultSortColumn: "target_date",
});

// =====================================================================
// METRIC RESOLVER
// =====================================================================
// Maps a metric_key string to a SQL query that returns the latest
// logged value for that metric. Add a new entry here whenever a new
// auto-tracked milestone type is needed.

type MetricResolver = (env: Env) => Promise<number | null>;

const METRIC_RESOLVERS: Record<string, MetricResolver> = {
  body_weight_kg: async (env) => {
    const row = await env.DB.prepare(
      `SELECT weight_kg FROM body_metrics WHERE weight_kg IS NOT NULL ORDER BY entry_date DESC LIMIT 1`
    ).first<{ weight_kg: number }>();
    return row?.weight_kg ?? null;
  },

  breath_hold_seconds: async (env) => {
    const row = await env.DB.prepare(
      `SELECT hold_duration_seconds FROM breath_sessions WHERE hold_duration_seconds IS NOT NULL ORDER BY entry_date DESC LIMIT 1`
    ).first<{ hold_duration_seconds: number }>();
    return row?.hold_duration_seconds ?? null;
  },

  // Push-up / pull-up / dip progress is tracked as max reps logged
  // for that exercise_name, most recent session, highest single set.
  pushup_max_reps: async (env) => maxRepsForExercise(env, "push-up"),
  pullup_max_reps: async (env) => maxRepsForExercise(env, "pull-up"),
  dip_max_reps: async (env) => maxRepsForExercise(env, "dip"),

  dead_hang_seconds: async (env) => {
    const row = await env.DB.prepare(
      `SELECT MAX(hold_seconds) as max_hold FROM workout_exercise_sets WHERE exercise_name = 'dead hang'`
    ).first<{ max_hold: number }>();
    return row?.max_hold ?? null;
  },

  memory_deck_time_seconds: async (env) => {
    const row = await env.DB.prepare(
      `SELECT memory_deck_time_seconds FROM hobby_sessions WHERE hobby_type = 'memory' AND memory_deck_time_seconds IS NOT NULL ORDER BY entry_date DESC LIMIT 1`
    ).first<{ memory_deck_time_seconds: number }>();
    return row?.memory_deck_time_seconds ?? null;
  },

  morse_wpm: async (env) => {
    const row = await env.DB.prepare(
      `SELECT morse_wpm FROM hobby_sessions WHERE hobby_type = 'morse' AND morse_wpm IS NOT NULL ORDER BY entry_date DESC LIMIT 1`
    ).first<{ morse_wpm: number }>();
    return row?.morse_wpm ?? null;
  },

  leetcode_total_solved: async (env) => {
    const row = await env.DB.prepare(
      `SELECT SUM(leetcode_problems_solved) as total FROM engineering_activity_log WHERE leetcode_problems_solved IS NOT NULL`
    ).first<{ total: number }>();
    return row?.total ?? null;
  },
};

async function maxRepsForExercise(env: Env, exerciseName: string): Promise<number | null> {
  const row = await env.DB.prepare(
    `SELECT MAX(reps) as max_reps FROM workout_exercise_sets WHERE exercise_name = ?`
  )
    .bind(exerciseName)
    .first<{ max_reps: number }>();
  return row?.max_reps ?? null;
}

function evaluateComparison(
  current: number,
  target: number,
  comparison: string
): boolean {
  switch (comparison) {
    case "lte":
      return current <= target;
    case "gte":
      return current >= target;
    case "eq":
      return current === target;
    default:
      return false;
  }
}

// GET /roadmap/milestones/:id/progress
// Returns the milestone plus its resolved current value and whether
// it's achieved, WITHOUT writing anything back to the milestone row.
// This is a read-only computed view — the milestone's `status` field
// in the DB is only updated when the user explicitly confirms it
// (see markAchieved below), not automatically on every read.
export async function getMilestoneProgress(id: string, env: Env): Promise<Response> {
  const milestone = await env.DB.prepare(`SELECT * FROM roadmap_milestones WHERE id = ?`)
    .bind(id)
    .first<Record<string, any>>();

  if (!milestone) {
    return jsonResponse({ error: "Not found" }, 404);
  }

  if (!milestone.metric_key) {
    // Manually-tracked milestone, no auto-resolution possible.
    return jsonResponse({
      ...milestone,
      current_value: null,
      is_achieved: milestone.status === "achieved",
      auto_tracked: false,
    });
  }

  const resolver = METRIC_RESOLVERS[milestone.metric_key];
  if (!resolver) {
    return jsonResponse({
      ...milestone,
      current_value: null,
      is_achieved: milestone.status === "achieved",
      auto_tracked: false,
      resolver_error: `No resolver registered for metric_key '${milestone.metric_key}'`,
    });
  }

  const currentValue = await resolver(env);
  const isAchieved =
    currentValue !== null && milestone.target_value !== null
      ? evaluateComparison(currentValue, milestone.target_value, milestone.comparison)
      : false;

  return jsonResponse({
    ...milestone,
    current_value: currentValue,
    is_achieved: isAchieved,
    auto_tracked: true,
  });
}

// GET /roadmap/domains/:domainId/progress
// Bulk version: all milestones for a domain, each with resolved progress.
// This is what the Roadmap dashboard view calls — one request instead
// of N requests for N milestones.
export async function getDomainProgress(domainId: string, env: Env): Promise<Response> {
  const { results: milestones } = await env.DB.prepare(
    `SELECT * FROM roadmap_milestones WHERE domain_id = ? ORDER BY target_date ASC`
  )
    .bind(domainId)
    .all<Record<string, any>>();

  const resolved = await Promise.all(
    milestones.map(async (milestone) => {
      if (!milestone.metric_key || !METRIC_RESOLVERS[milestone.metric_key]) {
        return {
          ...milestone,
          current_value: null,
          is_achieved: milestone.status === "achieved",
          auto_tracked: false,
        };
      }
      const currentValue = await METRIC_RESOLVERS[milestone.metric_key](env);
      const isAchieved =
        currentValue !== null && milestone.target_value !== null
          ? evaluateComparison(currentValue, milestone.target_value, milestone.comparison)
          : false;
      return {
        ...milestone,
        current_value: currentValue,
        is_achieved: isAchieved,
        auto_tracked: true,
      };
    })
  );

  return jsonResponse(resolved);
}

// POST /roadmap/milestones/:id/mark-achieved
// Explicit user confirmation writes achieved status + snapshots the
// value at that moment. Kept separate from the read-only progress
// check above so "checking progress" never has a side effect.
export async function markMilestoneAchieved(id: string, request: Request, env: Env): Promise<Response> {
  let body: { achieved_value?: number } = {};
  try {
    body = await request.json();
  } catch {
    // Body is optional for this endpoint — achieved_value can be omitted.
  }

  const now = new Date().toISOString();
  const result = await env.DB.prepare(
    `UPDATE roadmap_milestones SET status = 'achieved', achieved_date = ?, achieved_value = ?, updated_at = ? WHERE id = ?`
  )
    .bind(now.split("T")[0], body.achieved_value ?? null, now, id)
    .run();

  if (result.meta.changes === 0) {
    return jsonResponse({ error: "Not found" }, 404);
  }

  const updated = await env.DB.prepare(`SELECT * FROM roadmap_milestones WHERE id = ?`)
    .bind(id)
    .first();

  return jsonResponse(updated);
}
