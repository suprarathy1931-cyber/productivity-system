import { createCrudHandlers } from "../lib/crud";

export const workLogHandlers = createCrudHandlers({
  tableName: "work_log_entries",
  writableColumns: [
    "entry_date",
    "work_mode",
    "hours_logged",
    "tasks_summary",
    "blockers",
    "notes",
  ],
});

export const engineeringActivityHandlers = createCrudHandlers({
  tableName: "engineering_activity_log",
  writableColumns: [
    "entry_date",
    "activity_type",
    "leetcode_problems_solved",
    "leetcode_difficulty",
    "course_name",
    "duration_minutes",
    "notes",
  ],
  supportsUpdate: false,
  hasUpdatedAt: false,
});
