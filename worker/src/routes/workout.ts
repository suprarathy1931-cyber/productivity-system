import { createCrudHandlers, jsonResponse } from "../lib/crud";
import type { Env } from "../lib/auth";

export const workoutSessionHandlers = createCrudHandlers({
  tableName: "workout_sessions",
  writableColumns: [
    "entry_date",
    "session_type",
    "duration_minutes",
    "knee_pain_score",
    "knee_support_worn",
    "notes",
  ],
});

export const bodyMetricsHandlers = createCrudHandlers({
  tableName: "body_metrics",
  writableColumns: ["entry_date", "weight_kg", "notes"],
});

// Exercise sets are a child of a session (not a standalone log a user
// browses independently), so instead of the generic list/get-by-id
// pattern, the two operations that actually matter are:
//   - list all sets for a given session
//   - bulk-create sets for a session (log a whole workout's sets at once)
// supportsUpdate is intentionally not used here for sets since a set once
// logged is rarely edited — if you got a rep count wrong, deleting and
// re-adding is simpler than patching.

export const exerciseSetHandlers = {
  // GET /workout-sessions/:sessionId/sets
  async listForSession(sessionId: string, env: Env): Promise<Response> {
    const { results } = await env.DB.prepare(
      `SELECT * FROM workout_exercise_sets WHERE session_id = ? ORDER BY created_at ASC`
    )
      .bind(sessionId)
      .all();
    return jsonResponse(results);
  },

  // POST /workout-sessions/:sessionId/sets
  // Body: { sets: [ { exercise_name, exercise_stage, set_number, reps, ... }, ... ] }
  // Accepts an array so a whole session's worth of sets can be logged
  // in one request instead of one round-trip per set.
  async createForSession(sessionId: string, request: Request, env: Env): Promise<Response> {
    let body: { sets?: Record<string, any>[] };
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    if (!Array.isArray(body.sets) || body.sets.length === 0) {
      return jsonResponse({ error: "Body must include a non-empty 'sets' array" }, 400);
    }

    const now = new Date().toISOString();
    const allowedColumns = [
      "exercise_name",
      "exercise_stage",
      "set_number",
      "reps",
      "hold_seconds",
      "weight_kg",
      "distance_meters",
    ];

    const statements = body.sets.map((set) => {
      const cols = ["id", "session_id", ...allowedColumns.filter((c) => c in set), "created_at"];
      const vals = [
        crypto.randomUUID(),
        sessionId,
        ...allowedColumns.filter((c) => c in set).map((c) => set[c]),
        now,
      ];
      const placeholders = cols.map(() => "?").join(", ");
      return env.DB.prepare(
        `INSERT INTO workout_exercise_sets (${cols.join(", ")}) VALUES (${placeholders})`
      ).bind(...vals);
    });

    await env.DB.batch(statements);

    const { results } = await env.DB.prepare(
      `SELECT * FROM workout_exercise_sets WHERE session_id = ? ORDER BY created_at ASC`
    )
      .bind(sessionId)
      .all();

    return jsonResponse(results, 201);
  },

  async deleteOne(setId: string, env: Env): Promise<Response> {
    const result = await env.DB.prepare(`DELETE FROM workout_exercise_sets WHERE id = ?`)
      .bind(setId)
      .run();

    if (result.meta.changes === 0) {
      return jsonResponse({ error: "Not found" }, 404);
    }
    return new Response(null, { status: 204 });
  },
};
