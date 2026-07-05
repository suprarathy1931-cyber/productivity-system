// =====================================================================
// LOCAL DATABASE (IndexedDB via Dexie)
// =====================================================================
// This mirrors the D1 schema closely — same column names, same shapes
// — so syncing a row is a direct mapping, not a translation layer.
// Only breath_sessions is defined for now (proving the pattern on one
// module before replicating to the other 7, per the plan).
//
// Every table needs sync_status indexed, since the sync engine's core
// query is "find all rows where sync_status = 'pending'" and that
// needs to be fast even as a table grows to thousands of rows over
// years of daily logging.

import Dexie, { type EntityTable } from "dexie";

export interface BreathSession {
  id: string;
  entry_date: string;
  started_at?: string;
  kapalabhati_rounds?: number;
  kapalabhati_exhales_per_round?: number;
  anulom_vilom_cycles?: number;
  box_breathing_cycles?: number;
  box_breathing_count_seconds?: number;
  hold_exhale_pct?: number;
  hold_duration_seconds?: number;
  recovery_cycles?: number;
  notes?: string;
  felt_dizzy?: number;
  created_at: string;
  updated_at: string;
  sync_status: "synced" | "pending" | "conflict";
}

const db = new Dexie("ProductivitySystem") as Dexie & {
  breath_sessions: EntityTable<BreathSession, "id">;
};

// Dexie schema string format: "primaryKey, indexedField1, indexedField2, ..."
// id is the primary key. entry_date and sync_status are indexed because
// those are the two things every query filters or sorts by (entry_date
// for "show me this week's sessions", sync_status for the sync engine).
db.version(1).stores({
  breath_sessions: "id, entry_date, sync_status",
});

export { db };
