import { createCrudHandlers } from "../lib/crud";

// Focus sessions have sync_status (offline-first, mobile-logged) but
// no updated_at column — the schema treats a session's start/end/
// duration as fixed once logged, though label/notes can still be
// edited after the fact (e.g. correcting a mislabeled session), so
// supportsUpdate stays at its default true. hasUpdatedAt: false
// matches the real schema.
export const focusHandlers = createCrudHandlers({
  tableName: "focus_sessions",
  writableColumns: [
    "entry_date",
    "started_at",
    "ended_at",
    "duration_minutes",
    "domain_id",
    "label",
    "notes",
  ],
  hasUpdatedAt: false,
});
