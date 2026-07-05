// =====================================================================
// API CLIENT
// =====================================================================
// Thin wrapper around fetch for talking to the Worker API. Every
// module and the sync layer route through this rather than calling
// fetch directly, so the base URL and auth header only exist in one
// place. Deliberately minimal — no retry/backoff logic here, that
// lives in the sync layer where it actually belongs (a failed sync
// push should retry later; a failed read the user is actively
// waiting on should just surface the error).

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string;
const API_KEY = import.meta.env.VITE_API_KEY as string;

if (!API_BASE_URL) {
  // Fail loudly at module load, not on the first request — a missing
  // env var should be obvious immediately, not manifest as a cryptic
  // network error the first time someone tries to log something.
  throw new Error(
    "VITE_API_BASE_URL is not set. Check your .env file (see .env.example)."
  );
}

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let errorBody: unknown;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = await response.text();
    }
    throw new ApiError(
      response.status,
      errorBody,
      `${method} ${path} failed with status ${response.status}`
    );
  }

  // DELETE returns 204 No Content — nothing to parse.
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};
