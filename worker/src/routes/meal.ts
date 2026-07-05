import { createCrudHandlers } from "../lib/crud";

export const mealHandlers = createCrudHandlers({
  tableName: "meal_entries",
  writableColumns: [
    "entry_date",
    "meal_slot",
    "description",
    "followed_plan",
    "protein_included",
    "notes",
  ],
});

// Water intake is append-only: you log a glass, you don't go back and
// edit a past glass of water. supportsUpdate: false makes PATCH return
// a clear 405 instead of silently doing nothing. hasUpdatedAt: false
// because the schema genuinely has no updated_at column on this table
// (it's stamp-once log data, not an editable row).
export const waterHandlers = createCrudHandlers({
  tableName: "water_intake",
  writableColumns: ["entry_date", "liters"],
  supportsUpdate: false,
  hasUpdatedAt: false,
});
