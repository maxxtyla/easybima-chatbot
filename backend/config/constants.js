//
// constants.js — single source of truth for tunable values that were
// previously scattered as magic numbers across services/utils.
//
// Rule of thumb for what belongs here: any number you might want to
// change without reading the surrounding code, or that you'd want a test
// to override directly (e.g. cache TTL, history window, SLA hours).
// Anything env-driven still reads from process.env — this module just
// centralizes the *default* and the *name*, so "what's the conversation
// history window?" has exactly one place to look instead of a grep.
//

// ── LLM call tuning (claudeService.js) ─────────────────────────────────────
const LLM = {
  // How many prior turns from conversation history get sent to the model.
  // Keeping this small controls both cost and prompt-injection surface
  // from old messages; 8 was chosen empirically — see claudeService.js
  // history trimming notes.
  HISTORY_WINDOW_TURNS: 8,

  DEFAULT_MAX_TOKENS: parseInt(process.env.CLAUDE_MAX_TOKENS) || 2048,
  DEFAULT_TEMPERATURE: parseFloat(process.env.CLAUDE_TEMPERATURE) || 0.2,
  DEFAULT_MODEL: process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet',
};

// ── RAG / intent routing caches (utils/intentRouter.js) ─────────────────────
const RAG_CACHE = {
  // All five term caches (branch locations, FAQ terms, product terms,
  // claims terms, company terms) use the same TTL today. Split these out
  // individually if one ever needs to diverge (e.g. products change more
  // often than branch locations).
  LOCATION_TTL_MS: 5 * 60 * 1000,
  FAQ_TERM_TTL_MS: 5 * 60 * 1000,
  PRODUCT_TERM_TTL_MS: 5 * 60 * 1000,
  CLAIMS_TERM_TTL_MS: 5 * 60 * 1000,
  COMPANY_TERM_TTL_MS: 5 * 60 * 1000,
};

// ── Intent classification tuning (utils/intentRouter.js) ───────────────────
// Dialogflow-inspired scoring: instead of "did any keyword substring
// appear" (boolean OR), each intent gets a weighted raw score that's
// squashed into a 0–1 confidence value, gated by CONFIDENCE_THRESHOLD —
// same default (0.3) Dialogflow ES uses for its Default Fallback Intent.
const INTENT_ROUTER = {
  // Below this confidence, an intent is treated as "not requested" even if
  // one keyword happened to match. Raise this to make routing stricter
  // (fewer, more confident table hits); lower it to make routing looser.
  CONFIDENCE_THRESHOLD: 0.3,

  // confidence = raw / (raw + SOFTEN_K). SOFTEN_K=2 means a single strong
  // hit (raw=2, e.g. one matched multi-word phrase) already clears the
  // 0.3 threshold, while a lone weak hit (raw=1) sits right at ~0.33 —
  // matched-but-marginal, which is the intent of a "soft" gate.
  SOFTEN_K: 2,

  // Training-phrase weighting: a multi-word phrase match ("private motor")
  // is a stronger signal than a single word ("motor") that could appear
  // in unrelated context, so it scores higher — approximating what
  // Dialogflow's ML model gets "for free" from longer training phrases.
  STATIC_PHRASE_WEIGHT_MULTI: 2,
  STATIC_PHRASE_WEIGHT_SINGLE: 1,

  // A hit against a live DB keyword/tag column is trusted more than a
  // hand-maintained static phrase — it's curated per-row against real
  // catalog/FAQ/claims/company data, so false positives are rarer.
  DYNAMIC_TERM_WEIGHT: 1.5,

  // Context carryover (Dialogflow "contexts"): how many of the most
  // recent USER turns are eligible to donate intent to an ambiguous
  // follow-up message (e.g. "WIBA?" -> "how much is it"). 2 mirrors a
  // short input-context lifespan — long enough to catch a quick follow-up,
  // short enough that the bot doesn't stay pinned to a stale topic.
  CONTEXT_LIFESPAN_TURNS: 2,
};

// ── RAG result limits (chatEngine.js) ───────────────────────────────────────
const RAG_LIMITS = {
  FAQ_TOP_K: 3,
  COMPANY_TOP_K: 3,
  PRODUCTS_TOP_K: 5,
  BRANCHES_TOP_K: 5,
  CLAIMS_TOP_K: 5,
};

// ── Ticket priority scoring (priorityService.js) ────────────────────────────
const TICKET_PRIORITY = {
  SLA_HOURS_BY_TIER: {
    urgent: 1,
    high: 4,
    medium: 24,
    low: 72,
  },
  // Score thresholds for scoreToTier() — kept alongside SLA hours since
  // they're tuned together (changing one usually means reconsidering the
  // other).
  TIER_THRESHOLDS: {
    urgent: 6,
    high: 4,
    medium: 2,
  },
  SIGNAL_WEIGHTS: {
    ANGRY_SENTIMENT: 2,
    URGENT_KEYWORD: 2,
    COMPLAINT_KEYWORD: 2,
    SENSITIVE_CATEGORY: 1,
    REPEAT_ESCALATION: 1,
  },
};

// ── Rate limiting (middleware/rateLimiter.js) ───────────────────────────────
// All windows are 1 minute today; kept as one constant so a future change
// to the window (e.g. 5-minute buckets) is a single edit, not five.
const RATE_LIMIT = {
  WINDOW_MS: 60 * 1000,
  PUBLIC_MAX: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 30,
  CHAT_MAX: 100,
  STAFF_MAX: parseInt(process.env.STAFF_RATE_LIMIT_MAX) || 300,
  STRICT_MAX: 10,
  WHATSAPP_MAX: parseInt(process.env.WHATSAPP_RATE_LIMIT_MAX) || 20,
};

// ── Session management ───────────────────────────────────────────────────
const SESSION = {
  // Kept here even though sessionManager.js currently reads its own env
  // vars directly — surfacing the shape here makes it visible without
  // opening that file. If sessionManager.js has its own IDLE_TIMEOUT_MS /
  // etc., migrate those in as a follow-up rather than duplicating.
};

module.exports = {
  LLM,
  RAG_CACHE,
  INTENT_ROUTER,
  RAG_LIMITS,
  TICKET_PRIORITY,
  RATE_LIMIT,
  SESSION,
};