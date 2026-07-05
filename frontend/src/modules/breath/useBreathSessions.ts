// =====================================================================
// useBreathSessions — Breath Log module data hook
// =====================================================================
// This is the pattern every other module's data hook will follow once
// proven here: reads come straight from the local Dexie table (fast,
// works offline, no loading spinner for data that's already local),
// writes go to Dexie FIRST (so the UI updates instantly and the entry
// is durable even if the network never shows up), then are marked
// sync_status='pending' so the sync engine (sync.ts) picks them up
// and pushes to the Worker API whenever connectivity allows.
//
// CONTRACT WITH sync.ts: every local write through this hook MUST set
// sync_status='pending' and MUST bump updated_at, even for a first-
// time create. This is what lets sync.ts's wasEverSynced check
// (updated_at !== created_at) correctly distinguish "never synced" —
// on first create here, updated_at is deliberately set equal to
// created_at (see createBreathSession below), so the very first sync
// attempt takes the POST path. Any FOLLOW-UP local edit bumps
// updated_at to something later than created_at, which correctly
// flips sync.ts onto the PATCH path from then on — including for a
// row that had already synced once (sync_status was 'synced', this
// edit sets it back to 'pending', and PATCH is exactly the right
// operation to push that edit).

import { useLiveQuery } from "dexie-react-hooks";
import { db, type BreathSession } from "../../lib/db";
import { api } from "../../lib/api";

// Fields the user actually fills in when logging a session — the rest
// (id, created_at, updated_at, sync_status) are managed by this hook,
// not the UI layer, so a form component never has to think about sync
// bookkeeping.
export type BreathSessionInput = Omit<
  BreathSession,
  "id" | "created_at" | "updated_at" | "sync_status"
>;

function generateLocalId(): string {
  return crypto.randomUUID();
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Live-updating list of breath sessions, optionally filtered to a date
 * range. Backed directly by Dexie's live query — the returned array
 * re-renders automatically whenever the underlying IndexedDB table
 * changes (including changes made by the sync engine flipping
 * sync_status), with no manual refetch needed anywhere.
 */
export function useBreathSessions(options?: { from?: string; to?: string }) {
  const sessions = useLiveQuery(async () => {
    let collection = db.breath_sessions.orderBy("entry_date").reverse();

    if (options?.from || options?.to) {
      const all = await collection.toArray();
      return all.filter((s) => {
        if (options.from && s.entry_date < options.from) return false;
        if (options.to && s.entry_date > options.to) return false;
        return true;
      });
    }

    return collection.toArray();
  }, [options?.from, options?.to]);

  return sessions ?? [];
}

/**
 * Creates a new breath session locally. Returns immediately (the
 * IndexedDB write is fast) — sync to the server happens in the
 * background via sync.ts, not as part of this call.
 */
export async function createBreathSession(
  input: BreathSessionInput
): Promise<BreathSession> {
  const now = nowIso();
  const session: BreathSession = {
    ...input,
    id: generateLocalId(),
    created_at: now,
    // Deliberately equal to created_at on first create — see the
    // contract note at the top of this file. This is what makes
    // sync.ts's wasEverSynced check correctly route a brand-new
    // record through POST on its first sync attempt.
    updated_at: now,
    sync_status: "pending",
  };

  await db.breath_sessions.add(session);
  return session;
}

/**
 * Updates an existing breath session locally. Always bumps updated_at
 * and resets sync_status to 'pending' — this is what correctly
 * re-queues an already-synced row for a PATCH push, and what makes
 * sync.ts's wasEverSynced check see updated_at !== created_at from
 * this point forward, permanently routing this row through PATCH on
 * all future syncs (correct, since after the first successful sync
 * the row does exist server-side).
 */
export async function updateBreathSession(
  id: string,
  changes: Partial<BreathSessionInput>
): Promise<void> {
  await db.breath_sessions.update(id, {
    ...changes,
    updated_at: nowIso(),
    sync_status: "pending",
  });
}

export async function deleteBreathSession(id: string): Promise<void> {
  // Deletes are NOT queued through the sync_status pending mechanism
  // — there's no "pending delete" concept in this schema, so a delete
  // made offline will not propagate to the server until the app is
  // back online AND the user is on a screen that triggers a delete
  // sync. For a single-user daily-logging app this is an acceptable
  // gap for now (deleting a past log entry offline is rare), but it's
  // a known limitation worth flagging rather than silently accepting:
  // if this becomes a real workflow, the fix is a small local
  // "pending_deletes" table the sync engine also drains.
  await db.breath_sessions.delete(id);
  try {
    await api.delete(`/breath-sessions/${id}`);
  } catch {
    // Offline or request failed — the local row is already gone (the
    // UI reflects the delete immediately) but the server-side row
    // will linger until the next time this exact delete is retried
    // manually. Documented limitation, not a silent failure — logged
    // so it's at least visible in the console during development.
    console.warn(
      `Delete of breath session ${id} could not be synced to the server (likely offline). ` +
        `The local copy is deleted; the server copy will remain until manually cleaned up.`
    );
  }
}

/**
 * Convenience hook for the single most important stat on this
 * module's screen: the latest logged breath-hold time, which is what
 * the person actually watches improve week over week per their plan.
 */
export function useLatestBreathHold() {
  return useLiveQuery(async () => {
    const latest = await db.breath_sessions
      .orderBy("entry_date")
      .reverse()
      .filter((s) => s.hold_duration_seconds != null)
      .first();
    return latest?.hold_duration_seconds ?? null;
  }, []);
}
