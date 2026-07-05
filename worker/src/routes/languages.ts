import { createCrudHandlers } from "../lib/crud";

// `languages` is a reference table (the 9 languages from the roadmap
// doc, seeded once — see schema/seed.sql) rather than a daily log, but
// it still needs update support since current_pct changes over time
// as a manually-adjusted milestone-adjacent field. hasSyncStatus: false
// because this table has no sync_status column — it's not offline-first
// log data written from a mobile client, it's reference data edited
// occasionally, usually from wherever there's a stable connection.
export const languageHandlers = createCrudHandlers({
  tableName: "languages",
  writableColumns: [
    "name",
    "tier",
    "classification",
    "target_pct",
    "current_pct",
    "target_date",
    "is_active",
    "notes",
  ],
  hasSyncStatus: false,
  hasEntryDate: false,
  defaultSortColumn: "name",
});

// Append-only daily counters (Anki cards reviewed, Pimsleur lesson
// done) — same category as water_intake. You don't edit yesterday's
// Anki count, you log today's. No updated_at column in the schema.
export const languageActivityHandlers = createCrudHandlers({
  tableName: "language_activity_log",
  writableColumns: [
    "language_id",
    "entry_date",
    "activity_type",
    "anki_cards_reviewed",
    "pimsleur_lesson_number",
    "duration_minutes",
    "notes",
  ],
  supportsUpdate: false,
  hasUpdatedAt: false,
});
