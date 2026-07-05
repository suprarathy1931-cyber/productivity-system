// =====================================================================
// SYNC ENGINE
// =====================================================================
// Generic push-sync for any Dexie table that mirrors a D1 table.
// The model is deliberately simple and one-directional-per-record:
//
//   1. All writes happen locally first (see useBreathSessions.ts for
//      the module-level hook that does this) — the UI never waits on
//      the network to show a new entry.
//   2. Every locally-created/edited row is marked sync_status='pending'.
//   3. This engine periodically scans for pending rows and pushes them:
//      - a row that only exists locally (never synced) -> POST
//      - a row that exists remotely and was edited locally -> PATCH
//   4. On success, sync_status flips to 'synced'.
//   5. On failure (offline, server error), the row stays 'pending' and
//      is retried on the next sync pass — nothing is lost, it just
//      waits.
//
// Conflict handling: this system doesn't try to detect conflicts
// client-side. It relies on the server being the authority for
// "what does synced data look like" and last-write-wins by updated_at,
// exactly as decided earlier. A genuine simultaneous edit from two
// offline devices is rare for a single-user daily-logging app (you're
// not editing the same breath session from your phone and laptop in
// the same minute), so the simple model is the right level of
// complexity for this — a full CRDT-style merge would be solving a
// problem this app doesn't really have.
//
// This file is written generically enough to be reused for the other
// 7 modules' tables once the pattern is proven — the actual sync
// logic doesn't know anything breath-session-specific.

import type { Table, UpdateSpec } from "dexie";
import { api, ApiError } from "./api";

export interface SyncableRecord {
  id: string;
  sync_status: "synced" | "pending" | "conflict";
  created_at: string;
  updated_at?: string;
}

export interface SyncTableConfig<T extends SyncableRecord> {
  table: Table<T, string>;
  apiPath: string; // e.g. "/breath-sessions"
  // Whether this table's remote schema has updated_at (used to decide
  // POST-vs-PATCH: a row with updated_at !== created_at has been
  // edited since creation, so it's presumed to already exist remotely
  // and should PATCH rather than POST). Matches the same hasUpdatedAt
  // concept from the backend's CRUD factory config, for the same
  // reason — not every table has this column.
  hasUpdatedAt?: boolean;
}

export interface SyncResult {
  pushed: number;
  failed: number;
  errors: Array<{ id: string; error: string }>;
}

/**
 * Pushes all locally-pending rows for one table to the Worker API.
 * Safe to call repeatedly (e.g. on an interval) — rows that are
 * already 'synced' are never touched.
 */
export async function syncTable<T extends SyncableRecord>(
  config: SyncTableConfig<T>
): Promise<SyncResult> {
  const { table, apiPath, hasUpdatedAt = true } = config;

  const pendingRows = await table.where("sync_status").equals("pending").toArray();

  const result: SyncResult = { pushed: 0, failed: 0, errors: [] };

  for (const row of pendingRows) {
    try {
      // A row whose updated_at differs from created_at has been
      // edited since it was first created — meaning it either already
      // exists on the server (if this isn't its first sync) or is a
      // brand-new row that was edited locally before ever syncing
      // (e.g. created offline, then immediately corrected offline).
      // In both cases PATCH is safe IF the row already exists
      // server-side; if it doesn't, PATCH will 404 and we fall back
      // to POST below. This handles the "created and edited, all
      // offline, never synced" case correctly without needing a
      // separate "has this ever synced" flag.
      const wasEverSynced = hasUpdatedAt && row.updated_at !== row.created_at;

      if (wasEverSynced) {
        try {
          await api.patch(`${apiPath}/${row.id}`, stripLocalFields(row));
        } catch (err) {
          if (err instanceof ApiError && err.status === 404) {
            // Row was edited locally before its first successful sync
            // — it doesn't exist on the server yet. Fall back to POST.
            await api.post(apiPath, stripLocalFields(row));
          } else {
            throw err;
          }
        }
      } else {
        // POST is idempotent on the server for a given client-supplied
        // id — if this exact row already landed from a previous sync
        // attempt whose success response was lost, the server returns
        // the existing row with 200 instead of erroring or duplicating.
        // So a plain retry is always safe here, no fallback branching
        // needed.
        await api.post(apiPath, stripLocalFields(row));
      }

      // Cast via `unknown` first: T is still a generic, unresolved type
      // parameter at this point in the function, so TypeScript can't
      // compute UpdateSpec<T>'s key paths against it structurally
      // (that computation needs a concrete T). We know sync_status is
      // safe to set because T extends SyncableRecord, which guarantees
      // the field exists — TypeScript just can't prove that through a
      // generic. Routing through `unknown` is what TS's own error
      // message suggests for exactly this situation, rather than
      // silently asserting a structural match that can't be checked.
      await table.update(row.id, { sync_status: "synced" } as unknown as UpdateSpec<T>);
      result.pushed++;
    } catch (err) {
      result.failed++;
      result.errors.push({
        id: row.id,
        error: err instanceof Error ? err.message : String(err),
      });
      // Deliberately does NOT mark the row as 'conflict' or change its
      // status on failure — it stays 'pending' so the next sync pass
      // retries it. A transient network failure shouldn't require
      // manual intervention to recover from.
    }
  }

  return result;
}

// Local-only bookkeeping fields that shouldn't be sent to the API —
// the server assigns its own created_at/updated_at on write, and
// sync_status is meaningless outside the local DB.
function stripLocalFields<T extends SyncableRecord>(row: T): Partial<T> {
  const { sync_status, ...rest } = row;
  return rest as Partial<T>;
}

// =====================================================================
// SYNC SCHEDULER
// =====================================================================
// Wires up when syncTable actually runs: on app load, whenever the
// browser regains connectivity, and on a periodic interval as a
// fallback for cases where the 'online' event doesn't fire reliably
// (some mobile browsers are inconsistent about this).

type SyncableTableConfig = SyncTableConfig<any>;

let scheduledConfigs: SyncableTableConfig[] = [];
let intervalHandle: ReturnType<typeof setInterval> | null = null;

async function runAllSyncs() {
  for (const config of scheduledConfigs) {
    await syncTable(config);
  }
}

export function startSyncScheduler(configs: SyncableTableConfig[]) {
  scheduledConfigs = configs;

  // Sync immediately on startup (covers "app was closed while offline,
  // now reopened with connectivity").
  void runAllSyncs();

  // Sync the moment connectivity returns — this is the main driver for
  // "logged something on the bus with no signal, synced the moment the
  // bus passes a tower."
  window.addEventListener("online", () => {
    void runAllSyncs();
  });

  // Fallback interval, every 60 seconds, in case the 'online' event
  // doesn't fire (observed to be unreliable on some mobile browsers)
  // or connectivity flickers in a way the event doesn't catch cleanly.
  intervalHandle = setInterval(() => {
    if (navigator.onLine) {
      void runAllSyncs();
    }
  }, 60_000);
}

export function stopSyncScheduler() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
