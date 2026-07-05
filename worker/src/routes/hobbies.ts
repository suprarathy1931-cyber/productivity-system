import { createCrudHandlers } from "../lib/crud";

export const hobbyHandlers = createCrudHandlers({
  tableName: "hobby_sessions",
  writableColumns: [
    "entry_date",
    "hobby_type",
    "memory_deck_time_seconds",
    "memory_accuracy_pct",
    "morse_wpm",
    "morse_characters_known",
    "constellations_identified",
    "electronics_project_name",
    "electronics_project_stage",
    "duration_minutes",
    "notes",
  ],
});
