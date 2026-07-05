// =====================================================================
// AUTH MIDDLEWARE
// =====================================================================
// Single-user system gated by a shared secret. The frontend sends it
// as a header on every request; this checks it before any route handler
// runs. This is NOT a full auth system (no sessions, no per-user scoping)
// — it exists purely so the deployed Worker URL isn't wide open on the
// public internet. If this ever becomes multi-user, this whole file
// gets replaced, not extended.

export interface Env {
  DB: D1Database;
  API_KEY: string;
}

const HEADER_NAME = "x-api-key";

/**
 * Returns a 401 Response if the request's API key doesn't match,
 * or null if the request is authorized (caller should proceed).
 */
export function checkAuth(request: Request, env: Env): Response | null {
  const provided = request.headers.get(HEADER_NAME);

  if (!provided || provided !== env.API_KEY) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      {
        status: 401,
        headers: { "content-type": "application/json" },
      }
    );
  }

  return null;
}
