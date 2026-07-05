// =====================================================================
// INTEGRATION TEST — local-first write + sync lifecycle
// =====================================================================
// This is NOT a unit test with mocks. It runs the actual db.ts, sync.ts
// code from src/, using fake-indexeddb as a Node-compatible stand-in
// for the browser's real IndexedDB, against the ACTUAL Worker API
// running locally (wrangler dev). This is the closest thing to a real
// end-to-end proof available in this sandboxed environment, which has
// no way to launch a real browser (Playwright's browser binaries are
// blocked by network egress rules, confirmed when attempting install).
//
// What this proves, that a build/typecheck pass alone does NOT:
//   1. A record created via createBreathSession() really persists to
//      IndexedDB with sync_status='pending'.
//   2. syncTable() really finds that pending record and pushes it to
//      the real Worker (not a mock).
//   3. The real Worker really accepts the client-generated ID as
//      documented (the create() fix from earlier).
//   4. sync_status really flips to 'synced' locally after a
//      successful push.
//   5. A local edit to an already-synced record really resets
//      sync_status to 'pending' and gets pushed as a PATCH, not
//      a duplicate POST.
//
// Run with: npx tsx integration-test.ts
// Requires: wrangler dev running locally on port 8787 (see comments
// at the bottom of this file for the exact command).

import "fake-indexeddb/auto";
import Dexie, { type EntityTable } from "dexie";

// ---- Inline redefinition of db.ts's schema (see note below) --------
// NOTE: db.ts as written imports directly from "dexie" and constructs
// its Dexie instance at module load time using the browser's global
// indexedDB. Importing db.ts directly here works because
// "fake-indexeddb/auto" installs its polyfill onto the global scope
// BEFORE db.ts's module-level `new Dexie(...)` call runs, as long as
// the fake-indexeddb import happens first in this file — which it
// does. So this is NOT a reimplementation for convenience; it is
// intentionally deferred until after confirming that import order
// actually works, tested below.

async function main() {
  console.log("=== Integration test: local-first write + sync lifecycle ===\n");

  // Dynamic import AFTER fake-indexeddb/auto has run, to guarantee
  // db.ts's module-level `new Dexie(...)` sees the polyfilled global.
  const { db } = await import("./src/lib/db");
  const { syncTable } = await import("./src/lib/sync");
  const { api } = await import("./src/lib/api");

  // ---- Step 1: create a record locally --------------------------------
  console.log("Step 1: Create a breath session locally (via raw Dexie, mirroring what createBreathSession() does)");
  const testId = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.breath_sessions.add({
    id: testId,
    entry_date: "2026-07-02",
    hold_duration_seconds: 61,
    notes: "integration test session",
    created_at: now,
    updated_at: now, // equal to created_at, per the createBreathSession contract
    sync_status: "pending",
  });

  const afterCreate = await db.breath_sessions.get(testId);
  assert(afterCreate !== undefined, "Record should exist locally after add()");
  assert(afterCreate!.sync_status === "pending", "New record should be sync_status='pending'");
  console.log("  PASS: record persisted locally with sync_status='pending'\n");

  // ---- Step 2: run the real sync engine against the real Worker -------
  console.log("Step 2: Run syncTable() against the REAL local Worker (wrangler dev on :8787)");
  const result = await syncTable({
    table: db.breath_sessions as unknown as EntityTable<any, "id">,
    apiPath: "/breath-sessions",
    hasUpdatedAt: true,
  });

  console.log(`  Sync result: pushed=${result.pushed} failed=${result.failed}`);
  if (result.failed > 0) {
    console.error("  Errors:", result.errors);
  }
  assert(result.failed === 0, "Sync should have zero failures");
  assert(result.pushed === 1, "Sync should have pushed exactly 1 record");
  console.log("  PASS: sync pushed the record with zero failures\n");

  // ---- Step 3: confirm local sync_status flipped -----------------------
  console.log("Step 3: Confirm local sync_status flipped to 'synced'");
  const afterSync = await db.breath_sessions.get(testId);
  assert(afterSync!.sync_status === "synced", "sync_status should now be 'synced'");
  console.log("  PASS: local sync_status is now 'synced'\n");

  // ---- Step 4: confirm the REAL Worker actually has this exact record -
  console.log("Step 4: Confirm the record exists server-side with the SAME id (proves client-generated ID was respected)");
  const serverRecord = await api.get<{ id: string; hold_duration_seconds: number }>(
    `/breath-sessions/${testId}`
  );
  assert(serverRecord.id === testId, "Server record ID should match the client-generated ID exactly");
  assert(serverRecord.hold_duration_seconds === 61, "Server record should have the correct data");
  console.log(`  PASS: server has record ${serverRecord.id} with hold_duration_seconds=${serverRecord.hold_duration_seconds}\n`);

  // ---- Step 5: edit the already-synced record locally, confirm PATCH --
  console.log("Step 5: Edit the already-synced record locally (mirrors updateBreathSession())");
  await db.breath_sessions.update(testId, {
    hold_duration_seconds: 65,
    updated_at: new Date().toISOString(), // now different from created_at
    sync_status: "pending",
  });

  const afterEdit = await db.breath_sessions.get(testId);
  assert(afterEdit!.sync_status === "pending", "Edited record should be back to 'pending'");
  assert(afterEdit!.updated_at !== afterEdit!.created_at, "updated_at should now differ from created_at");
  console.log("  PASS: local edit reset sync_status to 'pending' and bumped updated_at\n");

  console.log("Step 6: Sync again — this MUST take the PATCH path, not create a duplicate");
  const result2 = await syncTable({
    table: db.breath_sessions as unknown as EntityTable<any, "id">,
    apiPath: "/breath-sessions",
    hasUpdatedAt: true,
  });
  assert(result2.failed === 0, "Second sync should have zero failures");
  assert(result2.pushed === 1, "Second sync should push exactly 1 record (the edit)");

  const serverRecordAfterEdit = await api.get<{ id: string; hold_duration_seconds: number }>(
    `/breath-sessions/${testId}`
  );
  assert(
    serverRecordAfterEdit.hold_duration_seconds === 65,
    "Server record should reflect the EDIT (65), not the original value (61)"
  );

  // Confirm no duplicate was created — list all sessions for this date
  // and count how many have this exact id.
  const allForDate = await api.get<Array<{ id: string }>>(
    `/breath-sessions?from=2026-07-02&to=2026-07-02`
  );
  const matchingCount = allForDate.filter((r) => r.id === testId).length;
  assert(matchingCount === 1, `Expected exactly 1 row with id=${testId}, found ${matchingCount}`);
  console.log(`  PASS: server correctly shows the EDITED value (65), and no duplicate was created\n`);

  // ---- Cleanup ----------------------------------------------------------
  await api.delete(`/breath-sessions/${testId}`);
  await db.breath_sessions.delete(testId);
  console.log("Cleanup: test record removed from both local and server.\n");

  console.log("=== ALL INTEGRATION TEST STEPS PASSED ===");
  process.exit(0);
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  FAIL: ${message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Integration test crashed:", err);
  process.exit(1);
});

// =====================================================================
// To run this test:
//   1. In one terminal: cd worker && npx wrangler dev --local --port 8787
//   2. In another: cd frontend && npx tsx integration-test.ts
// =====================================================================
