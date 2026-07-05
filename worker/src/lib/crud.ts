// =====================================================================
// GENERIC CRUD FACTORY
// =====================================================================
// Most of the 8 modules' log tables (breath_sessions, meal_entries,
// hobby_sessions, etc.) need the exact same four operations:
//   - list entries, optionally filtered by date range
//   - get one entry by id
//   - create an entry
//   - update an entry
//   - delete an entry
//
// Rather than hand-write this five times, this factory takes a table
// name + the list of columns it accepts and returns route handlers.
// The two genuinely special routes (roadmap milestone resolution,
// overall stats aggregation) are NOT built with this — they're
// hand-written in their own files because their logic is actually
// different, not just a different table name.
//
// This factory does NOT try to validate every field's type — D1/SQLite
// is loosely typed and the frontend (TypeScript) is the first line of
// type safety. This layer's job is: safe SQL construction (no string
// concatenation of user input — everything is parameterized), and
// stamping timestamps/sync_status consistently.

import type { Env } from "./auth";

export interface CrudConfig {
  tableName: string;
  // Columns the client is allowed to write. Deliberately explicit
  // (not "whatever keys are in the JSON body") so a client can't
  // inject writes to columns like `id` or `created_at` by accident
  // or on purpose.
  writableColumns: string[];
  // Whether PATCH is a valid operation on this table at all.
  // False for append-only logs where "updating" doesn't make sense
  // (e.g. water_intake — you don't edit a past glass of water, you
  // add a correction entry). Defaults to true.
  supportsUpdate?: boolean;
  // Which bookkeeping columns this table's schema ACTUALLY has.
  // These are independent of each other and independent of
  // supportsUpdate — e.g. roadmap_milestones supports PATCH (a user
  // can edit a milestone's target) and has updated_at, but has no
  // sync_status because it's not offline-first log data.
  // Auditing the real schema.sql per table (not assuming a default)
  // is what this config forces the caller to do.
  hasUpdatedAt?: boolean; // defaults to true
  hasSyncStatus?: boolean; // defaults to true
  // Whether this table has an entry_date column at all. False for
  // reference/hierarchy tables (languages, roadmap_domains,
  // roadmap_phases, roadmap_milestones) that aren't dated daily logs.
  // When false, the ?from=/?to= query params are ignored (there's no
  // date column to filter on) and defaultSortColumn is used for
  // ordering instead of entry_date. Defaults to true.
  hasEntryDate?: boolean;
  // Which column to ORDER BY when hasEntryDate is false. Required
  // in that case — without it, "list everything" has no defined
  // order and D1 makes no ordering guarantee on its own.
  defaultSortColumn?: string;
}


function nowIso(): string {
  return new Date().toISOString();
}

function generateId(): string {
  // crypto.randomUUID() is available in the Workers runtime natively.
  return crypto.randomUUID();
}

export function createCrudHandlers(config: CrudConfig) {
  const {
    tableName,
    writableColumns,
    supportsUpdate = true,
    hasUpdatedAt = true,
    hasSyncStatus = true,
    hasEntryDate = true,
    defaultSortColumn,
  } = config;

  // Fail loudly at handler-creation time (i.e. at Worker startup, when
  // routes/*.ts files call createCrudHandlers) rather than at request
  // time. A misconfiguration here should show up the moment the Worker
  // boots, not on whatever request happens to hit list() first.
  if (!hasEntryDate && !defaultSortColumn) {
    throw new Error(
      `createCrudHandlers("${tableName}"): hasEntryDate is false but no defaultSortColumn was provided. ` +
        `A table without entry_date needs an explicit column to ORDER BY.`
    );
  }
  const sortColumn = hasEntryDate ? "entry_date" : (defaultSortColumn as string);

  return {
    // GET /<table>?from=YYYY-MM-DD&to=YYYY-MM-DD&limit=100
    // The from/to filters only apply when hasEntryDate is true — for
    // reference tables (languages, roadmap_domains, etc.) they're
    // silently ignored rather than erroring, since a client sending
    // ?from= to a reference-table endpoint is a harmless no-op, not
    // something worth rejecting the whole request over.
    async list(request: Request, env: Env): Promise<Response> {
      const url = new URL(request.url);
      const from = hasEntryDate ? url.searchParams.get("from") : null;
      const to = hasEntryDate ? url.searchParams.get("to") : null;
      const limit = Math.min(
        parseInt(url.searchParams.get("limit") || "200", 10),
        1000 // hard ceiling so a bad query can't pull the whole table
      );

      let query = `SELECT * FROM ${tableName}`;
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (from) {
        conditions.push("entry_date >= ?");
        params.push(from);
      }
      if (to) {
        conditions.push("entry_date <= ?");
        params.push(to);
      }
      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(" AND ")}`;
      }
      query += ` ORDER BY ${sortColumn} DESC LIMIT ?`;
      params.push(limit);

      const { results } = await env.DB.prepare(query)
        .bind(...params)
        .all();

      return jsonResponse(results);
    },

    // GET /<table>/:id
    async getOne(id: string, env: Env): Promise<Response> {
      const row = await env.DB.prepare(`SELECT * FROM ${tableName} WHERE id = ?`)
        .bind(id)
        .first();

      if (!row) {
        return jsonResponse({ error: "Not found" }, 404);
      }
      return jsonResponse(row);
    },

    // POST /<table>
    // IMPORTANT: accepts a client-supplied `id` in the request body
    // and uses it if present, generating one server-side only as a
    // fallback. This is required for the local-first architecture —
    // the frontend creates a record in IndexedDB with a UUID the
    // moment the user logs something (before any network round-trip),
    // and that same ID must be the row's permanent identity in D1
    // once it syncs. If the server minted its own ID instead, every
    // offline-created record would get silently reassigned on sync,
    // breaking the local<->remote identity the whole sync model
    // depends on.
    async create(request: Request, env: Env): Promise<Response> {
      const body = await safeParseJson(request);
      if (body === null) {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
      }

      const id = typeof body.id === "string" && body.id.length > 0 ? body.id : generateId();

      // If a client-supplied ID already exists in this table, this is
      // very likely a RETRY of a sync push whose success response was
      // lost (e.g. connectivity dropped right as the response arrived)
      // — not a genuine new record. Rather than error, treat it as
      // idempotent: return the existing row as if this POST had
      // succeeded fresh. This is what lets the sync engine safely
      // retry a POST it's not sure actually landed, without risking
      // a duplicate row OR a confusing error on the retry.
      const existing = await env.DB.prepare(`SELECT * FROM ${tableName} WHERE id = ?`)
        .bind(id)
        .first();
      if (existing) {
        return jsonResponse(existing, 200);
      }

      const now = nowIso();

      // Only pull fields that are explicitly whitelisted. Anything
      // else in the body is silently ignored, not an error — this
      // lets the frontend send extra client-side-only fields without
      // the API rejecting the whole request.
      const columns = ["id", ...writableColumns.filter((c) => c in body), "created_at"];
      const values = [id, ...writableColumns.filter((c) => c in body).map((c) => body[c]), now];

      // Only stamp updated_at / sync_status if this table's real
      // schema actually has those columns — inserting into a column
      // that doesn't exist is a D1_ERROR at query time, not a
      // TypeScript-catchable mistake, which is exactly the bug this
      // conditional exists to prevent.
      if (hasUpdatedAt) {
        columns.push("updated_at");
        values.push(now);
      }
      if (hasSyncStatus) {
        columns.push("sync_status");
        values.push("synced");
      }

      const placeholders = columns.map(() => "?").join(", ");
      const query = `INSERT INTO ${tableName} (${columns.join(", ")}) VALUES (${placeholders})`;

      await env.DB.prepare(query).bind(...values).run();

      const created = await env.DB.prepare(`SELECT * FROM ${tableName} WHERE id = ?`)
        .bind(id)
        .first();

      return jsonResponse(created, 201);
    },

    // PATCH /<table>/:id
    async update(id: string, request: Request, env: Env): Promise<Response> {
      if (!supportsUpdate) {
        return jsonResponse(
          { error: `${tableName} entries are append-only and cannot be updated. Create a new entry instead.` },
          405
        );
      }

      const body = await safeParseJson(request);
      if (body === null) {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
      }

      const fieldsToUpdate = writableColumns.filter((c) => c in body);
      if (fieldsToUpdate.length === 0) {
        return jsonResponse({ error: "No valid fields provided to update" }, 400);
      }

      const now = nowIso();
      const setClauses = [...fieldsToUpdate.map((c) => `${c} = ?`)];
      const values = [...fieldsToUpdate.map((c) => body[c])];

      if (hasUpdatedAt) {
        setClauses.push("updated_at = ?");
        values.push(now);
      }
      if (hasSyncStatus) {
        setClauses.push("sync_status = ?");
        values.push("synced");
      }
      values.push(id); // WHERE id = ? — must be last

      const query = `UPDATE ${tableName} SET ${setClauses.join(", ")} WHERE id = ?`;
      const result = await env.DB.prepare(query).bind(...values).run();

      if (result.meta.changes === 0) {
        return jsonResponse({ error: "Not found" }, 404);
      }

      const updated = await env.DB.prepare(`SELECT * FROM ${tableName} WHERE id = ?`)
        .bind(id)
        .first();

      return jsonResponse(updated);
    },

    // DELETE /<table>/:id
    async remove(id: string, env: Env): Promise<Response> {
      const result = await env.DB.prepare(`DELETE FROM ${tableName} WHERE id = ?`)
        .bind(id)
        .run();

      if (result.meta.changes === 0) {
        return jsonResponse({ error: "Not found" }, 404);
      }

      return new Response(null, { status: 204 });
    },
  };
}

// =====================================================================
// Shared helpers
// =====================================================================

export function jsonResponse(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function safeParseJson(request: Request): Promise<Record<string, any> | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
