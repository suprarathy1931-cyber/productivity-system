// =====================================================================
// MAIN ROUTER
// =====================================================================
// Every request flow:
//   1. CORS preflight handled first (before auth) so browsers can
//      even ask what's allowed.
//   2. Auth check (checkAuth) — everything below this line assumes
//      the request is authorized.
//   3. Route to the matching module handler.
//
// Route naming follows REST conventions per module:
//   GET    /<resource>              list (supports ?from=&to=&limit=)
//   GET    /<resource>/:id          get one
//   POST   /<resource>              create
//   PATCH  /<resource>/:id          update
//   DELETE /<resource>/:id          delete
//
// IMPORTANT — itty-router handler signature:
// Handlers receive the enhanced request object FIRST — itty-router
// mutates the incoming Request, attaching `.params` (from the URL
// pattern) and `.query` (parsed search params) directly onto it, then
// calls handler(request, ...rest) where rest is whatever extra args
// were passed to router.fetch(request, env, ctx) — so effectively
// handler(request, env, ctx). There is no separate "params object"
// ever passed — `request.params.id` is how you read a URL param.
// Every handler below is typed as (request: IRequest, env: Env) so
// this is enforced by the real library type, not a hand-typed guess.

import { AutoRouter, cors, type IRequest } from "itty-router";
import { checkAuth, type Env } from "./lib/auth";
import { jsonResponse } from "./lib/crud";

import { breathHandlers } from "./routes/breath";
import { workoutSessionHandlers, bodyMetricsHandlers, exerciseSetHandlers } from "./routes/workout";
import { mealHandlers, waterHandlers } from "./routes/meal";
import { languageHandlers, languageActivityHandlers } from "./routes/languages";
import { workLogHandlers, engineeringActivityHandlers } from "./routes/worklog";
import { hobbyHandlers } from "./routes/hobbies";
import {
  domainHandlers,
  phaseHandlers,
  milestoneHandlers,
  getMilestoneProgress,
  getDomainProgress,
  markMilestoneAchieved,
} from "./routes/roadmap";
import { focusHandlers } from "./routes/focus";
import { getStatsOverview, getModuleStreak } from "./routes/stats";

const { preflight, corsify } = cors({
  origin: "*", // tighten this to your actual frontend origin once deployed
  allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "x-api-key"],
});

const router = AutoRouter({
  before: [preflight],
  finally: [corsify],
});

// -----------------------------------------------------------------
// Health check — deliberately NOT behind auth, so you can confirm
// the Worker is deployed and reachable without needing the API key.
// -----------------------------------------------------------------
router.get("/health", () => jsonResponse({ status: "ok", time: new Date().toISOString() }));

// -----------------------------------------------------------------
// Auth gate — every route registered after this point requires
// the x-api-key header to match.
// -----------------------------------------------------------------
router.all("*", (request: IRequest, env: Env) => checkAuth(request, env));

// ===================================================================
// 1. BREATH LOG
// ===================================================================
router.get("/breath-sessions", (request: IRequest, env: Env) => breathHandlers.list(request, env));
router.get("/breath-sessions/:id", (request: IRequest, env: Env) => breathHandlers.getOne(request.params.id, env));
router.post("/breath-sessions", (request: IRequest, env: Env) => breathHandlers.create(request, env));
router.patch("/breath-sessions/:id", (request: IRequest, env: Env) =>
  breathHandlers.update(request.params.id, request, env)
);
router.delete("/breath-sessions/:id", (request: IRequest, env: Env) => breathHandlers.remove(request.params.id, env));

// ===================================================================
// 2. WORKOUT & TRAINING JOURNAL
// ===================================================================
router.get("/workout-sessions", (request: IRequest, env: Env) => workoutSessionHandlers.list(request, env));
router.get("/workout-sessions/:id", (request: IRequest, env: Env) =>
  workoutSessionHandlers.getOne(request.params.id, env)
);
router.post("/workout-sessions", (request: IRequest, env: Env) => workoutSessionHandlers.create(request, env));
router.patch("/workout-sessions/:id", (request: IRequest, env: Env) =>
  workoutSessionHandlers.update(request.params.id, request, env)
);
router.delete("/workout-sessions/:id", (request: IRequest, env: Env) =>
  workoutSessionHandlers.remove(request.params.id, env)
);

router.get("/workout-sessions/:sessionId/sets", (request: IRequest, env: Env) =>
  exerciseSetHandlers.listForSession(request.params.sessionId, env)
);
router.post("/workout-sessions/:sessionId/sets", (request: IRequest, env: Env) =>
  exerciseSetHandlers.createForSession(request.params.sessionId, request, env)
);
router.delete("/exercise-sets/:id", (request: IRequest, env: Env) => exerciseSetHandlers.deleteOne(request.params.id, env));

router.get("/body-metrics", (request: IRequest, env: Env) => bodyMetricsHandlers.list(request, env));
router.get("/body-metrics/:id", (request: IRequest, env: Env) => bodyMetricsHandlers.getOne(request.params.id, env));
router.post("/body-metrics", (request: IRequest, env: Env) => bodyMetricsHandlers.create(request, env));
router.patch("/body-metrics/:id", (request: IRequest, env: Env) =>
  bodyMetricsHandlers.update(request.params.id, request, env)
);
router.delete("/body-metrics/:id", (request: IRequest, env: Env) => bodyMetricsHandlers.remove(request.params.id, env));

// ===================================================================
// 3. MEAL TRACKER
// ===================================================================
router.get("/meal-entries", (request: IRequest, env: Env) => mealHandlers.list(request, env));
router.get("/meal-entries/:id", (request: IRequest, env: Env) => mealHandlers.getOne(request.params.id, env));
router.post("/meal-entries", (request: IRequest, env: Env) => mealHandlers.create(request, env));
router.patch("/meal-entries/:id", (request: IRequest, env: Env) =>
  mealHandlers.update(request.params.id, request, env)
);
router.delete("/meal-entries/:id", (request: IRequest, env: Env) => mealHandlers.remove(request.params.id, env));

router.get("/water-intake", (request: IRequest, env: Env) => waterHandlers.list(request, env));
router.post("/water-intake", (request: IRequest, env: Env) => waterHandlers.create(request, env));
router.delete("/water-intake/:id", (request: IRequest, env: Env) => waterHandlers.remove(request.params.id, env));

// ===================================================================
// 4. LANGUAGES
// ===================================================================
router.get("/languages", (request: IRequest, env: Env) => languageHandlers.list(request, env));
router.get("/languages/:id", (request: IRequest, env: Env) => languageHandlers.getOne(request.params.id, env));
router.post("/languages", (request: IRequest, env: Env) => languageHandlers.create(request, env));
router.patch("/languages/:id", (request: IRequest, env: Env) =>
  languageHandlers.update(request.params.id, request, env)
);
router.delete("/languages/:id", (request: IRequest, env: Env) => languageHandlers.remove(request.params.id, env));

router.get("/language-activity", (request: IRequest, env: Env) => languageActivityHandlers.list(request, env));
router.get("/language-activity/:id", (request: IRequest, env: Env) =>
  languageActivityHandlers.getOne(request.params.id, env)
);
router.post("/language-activity", (request: IRequest, env: Env) => languageActivityHandlers.create(request, env));
router.patch("/language-activity/:id", (request: IRequest, env: Env) =>
  languageActivityHandlers.update(request.params.id, request, env)
);
router.delete("/language-activity/:id", (request: IRequest, env: Env) =>
  languageActivityHandlers.remove(request.params.id, env)
);

// ===================================================================
// 5. WORK-LOG
// ===================================================================
router.get("/work-log", (request: IRequest, env: Env) => workLogHandlers.list(request, env));
router.get("/work-log/:id", (request: IRequest, env: Env) => workLogHandlers.getOne(request.params.id, env));
router.post("/work-log", (request: IRequest, env: Env) => workLogHandlers.create(request, env));
router.patch("/work-log/:id", (request: IRequest, env: Env) =>
  workLogHandlers.update(request.params.id, request, env)
);
router.delete("/work-log/:id", (request: IRequest, env: Env) => workLogHandlers.remove(request.params.id, env));

router.get("/engineering-activity", (request: IRequest, env: Env) => engineeringActivityHandlers.list(request, env));
router.get("/engineering-activity/:id", (request: IRequest, env: Env) =>
  engineeringActivityHandlers.getOne(request.params.id, env)
);
router.post("/engineering-activity", (request: IRequest, env: Env) => engineeringActivityHandlers.create(request, env));
router.patch("/engineering-activity/:id", (request: IRequest, env: Env) =>
  engineeringActivityHandlers.update(request.params.id, request, env)
);
router.delete("/engineering-activity/:id", (request: IRequest, env: Env) =>
  engineeringActivityHandlers.remove(request.params.id, env)
);

// ===================================================================
// 6. HOBBIES LOG
// ===================================================================
router.get("/hobby-sessions", (request: IRequest, env: Env) => hobbyHandlers.list(request, env));
router.get("/hobby-sessions/:id", (request: IRequest, env: Env) => hobbyHandlers.getOne(request.params.id, env));
router.post("/hobby-sessions", (request: IRequest, env: Env) => hobbyHandlers.create(request, env));
router.patch("/hobby-sessions/:id", (request: IRequest, env: Env) =>
  hobbyHandlers.update(request.params.id, request, env)
);
router.delete("/hobby-sessions/:id", (request: IRequest, env: Env) => hobbyHandlers.remove(request.params.id, env));

// ===================================================================
// 7. ROADMAP + FOCUS
// ===================================================================
router.get("/roadmap/domains", (request: IRequest, env: Env) => domainHandlers.list(request, env));
router.get("/roadmap/domains/:id", (request: IRequest, env: Env) => domainHandlers.getOne(request.params.id, env));
router.post("/roadmap/domains", (request: IRequest, env: Env) => domainHandlers.create(request, env));
router.patch("/roadmap/domains/:id", (request: IRequest, env: Env) =>
  domainHandlers.update(request.params.id, request, env)
);
router.delete("/roadmap/domains/:id", (request: IRequest, env: Env) => domainHandlers.remove(request.params.id, env));
router.get("/roadmap/domains/:domainId/progress", (request: IRequest, env: Env) =>
  getDomainProgress(request.params.domainId, env)
);

router.get("/roadmap/phases", (request: IRequest, env: Env) => phaseHandlers.list(request, env));
router.get("/roadmap/phases/:id", (request: IRequest, env: Env) => phaseHandlers.getOne(request.params.id, env));
router.post("/roadmap/phases", (request: IRequest, env: Env) => phaseHandlers.create(request, env));
router.patch("/roadmap/phases/:id", (request: IRequest, env: Env) =>
  phaseHandlers.update(request.params.id, request, env)
);
router.delete("/roadmap/phases/:id", (request: IRequest, env: Env) => phaseHandlers.remove(request.params.id, env));

router.get("/roadmap/milestones", (request: IRequest, env: Env) => milestoneHandlers.list(request, env));
router.get("/roadmap/milestones/:id", (request: IRequest, env: Env) => milestoneHandlers.getOne(request.params.id, env));
router.post("/roadmap/milestones", (request: IRequest, env: Env) => milestoneHandlers.create(request, env));
router.patch("/roadmap/milestones/:id", (request: IRequest, env: Env) =>
  milestoneHandlers.update(request.params.id, request, env)
);
router.delete("/roadmap/milestones/:id", (request: IRequest, env: Env) =>
  milestoneHandlers.remove(request.params.id, env)
);
router.get("/roadmap/milestones/:id/progress", (request: IRequest, env: Env) =>
  getMilestoneProgress(request.params.id, env)
);
router.post("/roadmap/milestones/:id/mark-achieved", (request: IRequest, env: Env) =>
  markMilestoneAchieved(request.params.id, request, env)
);


router.get("/focus-sessions", (request: IRequest, env: Env) => focusHandlers.list(request, env));
router.get("/focus-sessions/:id", (request: IRequest, env: Env) => focusHandlers.getOne(request.params.id, env));
router.post("/focus-sessions", (request: IRequest, env: Env) => focusHandlers.create(request, env));
router.patch("/focus-sessions/:id", (request: IRequest, env: Env) =>
  focusHandlers.update(request.params.id, request, env)
);
router.delete("/focus-sessions/:id", (request: IRequest, env: Env) => focusHandlers.remove(request.params.id, env));

// ===================================================================
// 8. OVERALL STATS
// ===================================================================
router.get("/stats/overview", (_request: IRequest, env: Env) => getStatsOverview(env));
router.get("/stats/streak/:module", (request: IRequest, env: Env) =>
  getModuleStreak(request.params.module, env)
);

// -----------------------------------------------------------------
// Fallback
// -----------------------------------------------------------------
router.all("*", () => jsonResponse({ error: "Not found" }, 404));

export default {
  fetch: router.fetch,
} satisfies ExportedHandler<Env>;
