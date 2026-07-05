// =====================================================================
// OVERALL STATS
// =====================================================================
// No tables of its own. This route aggregates across all 7 other
// modules for the dashboard view. Built as hand-written queries
// (not the CRUD factory, which doesn't make sense for read-only
// cross-table aggregation) using the v_daily_activity_summary view
// from the schema plus a few direct queries for headline numbers.

import { jsonResponse } from "../lib/crud";
import type { Env } from "../lib/auth";

// GET /stats/overview
// Headline numbers for the main dashboard: current streak-relevant
// counts, latest key metrics, and a activity heatmap-friendly daily
// summary for the last N days.
export async function getStatsOverview(env: Env): Promise<Response> {
  const [latestWeight, latestBreathHold, last30DaysActivity, totalCounts] =
    await Promise.all([
      env.DB.prepare(`SELECT * FROM v_latest_body_weight`).first(),
      env.DB.prepare(`SELECT * FROM v_latest_breath_hold`).first(),
      env.DB.prepare(
        `SELECT * FROM v_daily_activity_summary WHERE entry_date >= date('now', '-30 days') ORDER BY entry_date ASC`
      ).all(),
      getTotalCountsAcrossModules(env),
    ]);

  return jsonResponse({
    latest_body_weight: latestWeight,
    latest_breath_hold: latestBreathHold,
    last_30_days_activity: last30DaysActivity.results,
    total_counts: totalCounts,
  });
}

async function getTotalCountsAcrossModules(env: Env) {
  const queries = {
    breath_sessions: `SELECT COUNT(*) as c FROM breath_sessions`,
    workout_sessions: `SELECT COUNT(*) as c FROM workout_sessions`,
    meals_logged: `SELECT COUNT(*) as c FROM meal_entries`,
    language_activities: `SELECT COUNT(*) as c FROM language_activity_log`,
    work_log_entries: `SELECT COUNT(*) as c FROM work_log_entries`,
    hobby_sessions: `SELECT COUNT(*) as c FROM hobby_sessions`,
    focus_sessions: `SELECT COUNT(*) as c FROM focus_sessions`,
    milestones_achieved: `SELECT COUNT(*) as c FROM roadmap_milestones WHERE status = 'achieved'`,
  };

  const entries = Object.entries(queries);
  const results = await Promise.all(
    entries.map(([, query]) => env.DB.prepare(query).first<{ c: number }>())
  );

  const counts: Record<string, number> = {};
  entries.forEach(([key], i) => {
    counts[key] = results[i]?.c ?? 0;
  });

  return counts;
}

// GET /stats/streak/:module
// Computes current consecutive-day streak for a given module's
// logging activity. Generic across modules since they all share the
// entry_date convention.
const STREAK_TABLE_MAP: Record<string, string> = {
  breath: "breath_sessions",
  workout: "workout_sessions",
  meal: "meal_entries",
  language: "language_activity_log",
  worklog: "work_log_entries",
  hobbies: "hobby_sessions",
  focus: "focus_sessions",
};

export async function getModuleStreak(moduleKey: string, env: Env): Promise<Response> {
  const tableName = STREAK_TABLE_MAP[moduleKey];
  if (!tableName) {
    return jsonResponse(
      { error: `Unknown module '${moduleKey}'. Valid options: ${Object.keys(STREAK_TABLE_MAP).join(", ")}` },
      400
    );
  }

  const { results } = await env.DB.prepare(
    `SELECT DISTINCT entry_date FROM ${tableName} ORDER BY entry_date DESC LIMIT 400`
  ).all<{ entry_date: string }>();

  const streak = computeConsecutiveDayStreak(results.map((r) => r.entry_date));

  return jsonResponse({ module: moduleKey, current_streak_days: streak });
}

function computeConsecutiveDayStreak(datesDescending: string[]): number {
  if (datesDescending.length === 0) return 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let streak = 0;
  let cursor = new Date(today);

  const dateSet = new Set(datesDescending);

  // A streak counts if today OR yesterday has an entry (so logging
  // "yesterday's workout" this morning doesn't break the streak before
  // you've had a chance to log today).
  const todayStr = cursor.toISOString().split("T")[0];
  if (!dateSet.has(todayStr)) {
    cursor.setDate(cursor.getDate() - 1);
  }

  while (true) {
    const dateStr = cursor.toISOString().split("T")[0];
    if (dateSet.has(dateStr)) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}
