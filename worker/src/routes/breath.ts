import { createCrudHandlers } from "../lib/crud";

export const breathHandlers = createCrudHandlers({
  tableName: "breath_sessions",
  writableColumns: [
    "entry_date",
    "started_at",
    "kapalabhati_rounds",
    "kapalabhati_exhales_per_round",
    "anulom_vilom_cycles",
    "box_breathing_cycles",
    "box_breathing_count_seconds",
    "hold_exhale_pct",
    "hold_duration_seconds",
    "recovery_cycles",
    "notes",
    "felt_dizzy",
  ],
});
