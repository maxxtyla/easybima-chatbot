//
// intentRouter — HYBRID Dialogflow-inspired intent classifier.
//
// Decides which tables in the schema are worth querying for a given user
// message (see schema.sql): faq_entries, insurance_products, branches,
// company_knowledge, claims. `analytics`, `conversations`, and `messages`
// are never part of retrieval routing — logging/history tables, handled by
// conversationService.js.
//
// ── Why "hybrid" and not just Dialogflow, and not just local keywords ──────
//
// Researched Dialogflow ES/CX before building this. Its core ideas are
// genuinely good and worth stealing: named Intents, weighted Training
// Phrases, typed Entities, a Default Fallback Intent, a confidence
// threshold (0.3 by default), and Contexts that bias short follow-up
// messages toward the previous turn's topic. All five of those concepts
// are reimplemented below, running in-process, with zero required network
// calls — because two things rule out relying on the live Dialogflow API
// as the ONLY source of truth:
//
//   1. Dialogflow has no Swahili/Sheng support. Kenyan customers code-switch
//      constantly ("naeza pata cover gani for gari yangu") — a router that
//      can't parse that is a regression, not an upgrade, for a big chunk
//      of real traffic.
//   2. This router's job is narrow: pick which Postgres tables to query for
//      RAG context. Claude is still the actual conversational NLU. Adding
//      a hard external dependency (GCP project, service account, network
//      round trip, $/session on CX) for a pre-filter is a lot of surface
//      area for a task this codebase already does at zero added latency.
//
// So the LOCAL scored classifier below is always authoritative — it now
// also covers claims and company_knowledge with live DB-driven term caches
// (previously only products/branches/FAQ had that; claims/company relied
// on static lists only — closed here). Dialogflow (services/dialogflowService.js)
// is an OPTIONAL layer: if DIALOGFLOW_ENABLED=true and it responds inside
// its timeout with a confident, mapped intent, its result is merged in as
// an extra scoring boost and a cleaner entity (e.g. city) extraction. If
// it's disabled, slow, wrong-mapped, low-confidence, or errors — which
// includes every Sheng/Swahili message, since the agent's language is
// English — the local classifier's own result stands completely on its
// own. Nothing breaks if Dialogflow is never configured at all.
//
// This is intentionally NOT an ML classifier — good enough because the
// domain vocabulary (branches/offices vs. products/cover vs. claims/renew
// vs. about/history) barely overlaps, same reasoning as the original file.
//

const { extractKeywords } = require('./keywords');
const { query } = require('../config/database');
const { RAG_CACHE, INTENT_ROUTER } = require('../config/constants');
const { detectDialogflowIntent } = require('../services/dialogflowService');

// ---------------------------------------------------------------------------
// Static "training phrases" — the Dialogflow-equivalent of hand-curated
// example utterances. Kept from the original file (this is real curated
// domain vocabulary — nicknames, Swahili terms, product slang) but
// deduped automatically via Set rather than retyped, since the original
// array had ~50 accidental duplicate entries.
// ---------------------------------------------------------------------------
const BRANCH_PHRASES = dedupe([
  'branch', 'branches', 'office', 'location', 'near me', 'find', 'where',
  'visit', 'address', 'directions', 'contact', 'phone number', 'email address',
]);

const PRODUCT_PHRASES = dedupe([
  'product', 'products', 'cover', 'coverage', 'insure', 'insurance', 'policy', 'haba', 'haba na haba',
  'plan', 'benefit', 'benefits', 'offer', 'motor', 'car insurance', 'health',
  'medisure', 'family', 'health', 'medical', 'inpatient', 'outpatient', 'hospital', 'diagnostics', 'chemotherapy', 'surgery', 'dependants',
  'group', 'personal accident', 'funeral', 'death', 'children', 'adults', 'group cover', 'benefit',
  'medical', 'life insurance', 'travel insurance', 'marine', 'wiba',
  'SME', 'medipack', 'small business', 'health', 'medical', 'inpatient', 'outpatient', 'maternity', 'dental', 'optical', 'group medical', 'employees', 'sme',
  'WIBA', 'work injury', 'employees', 'bodily injury', 'occupational disease', 'employer', 'workplace', 'work injury benefits act', 'work injury benefits', 'workers compensation', 'workers comp', 'workers compensation insurance',
  'indemnity', 'liability', 'malpractice', 'negligence', 'errors', 'omissions', 'lawyer', 'doctor', 'engineer', 'consultant', 'professional',
  'personal accident', 'education policy', 'pension', 'quote', 'premium',
  'fixed income', 'fixed money', 'fixed',
  'Dollar', '$', 'usa', 'United states Dollar',
  'Wealth fund',
  'invest', 'MMF', 'mmf', 'moneymarket', 'moneymarketfund', 'money', 'moneyfund', 'money market fund', 'money market', 'money market funds', 'money market investment', 'money market investments',
  'afya bora', 'affordable', 'family', 'health', 'inpatient', 'outpatient', 'children', 'parents', 'low cost', 'basic cover', '32000',
  'micro', 'jilinde', 'micro enterprise', 'SME', 'bodily injury', 'employees', 'workplace',
  'personal accident', 'injury', 'disability', 'death', 'medical expenses', 'funeral expenses', 'accident', 'died',
  'golfer', 'sportsman', 'sports', 'athlete', 'accident', 'disability', 'career',
  'domestic', 'home', 'house', 'property', 'buildings', 'contents', 'household', 'liability', 'domestic servant',
  'student', 'personal accident', 'injury', 'disability', 'death', 'medical expenses', 'funeral', 'school',
  'travel', 'holiday', 'trip', 'baggage', 'flight cancellation', 'medical', 'fly', 'abroad', 'tourist',
  'what do you', 'buy', 'purchase', 'sign up', 'get covered', 'recommend',
  'seniors', 'mediplan', 'elderly', 'old age', 'senior citizen', 'health', 'medical', '60 years', '80 years', 'geriatric', 'chronic', 'dental', 'optical',
  'private motor', 'monthly', 'vehicle', 'motor insurance', 'easy bima', 'installment',
  'cargo', 'transit', 'goods', 'merchandise', 'sea', 'air', 'rail', 'road', 'ICC-A', 'import', 'export', 'shipping',
  'commercial', 'vehicle', 'third party', 'bodily injury', 'property damage', 'driver', 'passengers', 'car', 'road',
  'student', 'personal accident', 'bodily injury', 'work insurance', 'accidental', 'violent', 'industry attachment insurance',
  'saving', 'savings', 'save', 'savings plan', 'savings account', 'savings product',
  'education savings', 'child savings', 'goal savings', 'savings and investment',
  'endowment', 'endowment policy', 'retirement savings', 'save money', 'saving plan', 'mobile savings', 'life cover', 'cover', 'akiba', 'akiba smart', 'jilinde',
  'investment protection', 'protection', 'academia', 'academia policy', 'invest plan', 'smart saver', 'bulgary', 'theft', 'thieves', 'stolen', 'stole',
  'funeral expense', 'medisure', 'grouplife', 'group life', 'loan guard', 'afya bora', 'seniors', 'SME', 'sme', 'medipack',
]);

const COMPANY_PHRASES = dedupe([
  'about', 'history', 'company', 'group', 'mission', 'vision',
  'founded', 'when was', 'leadership', 'ceo', 'chairman', 'subsidiary', 'history', 'overview',
  'subsidiaries', 'sustainability', 'careers', 'annual report', 'who are you',
  'X', 'twitter', 'social media', 'socialmedia', 'online platforms', 'linked in',
  'youtube', 'instagram', 'facebook',
  'job', 'opportunity', 'career', 'work', 'intern', 'jobs', 'hiring', 'new employees',
  'abroad branches', 'outside kenya', 'malawi', 'uganda', 'ug', 'ke', 's.sudan', 'south sudan', 'diaspora',
  'who is cic', 'staff', 'directors', 'leaders', 'leadership team', 'organization structure', 'managing directors',
]);

const FAQ_PHRASES = dedupe([
  'how do i', 'how to', 'renew', 'renewal', 'cancel',
  'cancellation', 'pay', 'payment', 'refund', 'complaint', 'complain',
  'document', 'documents', 'requirements', 'steps', 'apply',
  'application', 'help', 'faq', 'question',
]);

const CLAIMS_PHRASES = dedupe([
  'claim', 'claims', 'file a claim', 'lodge a claim', 'make a claim',
  'report a claim', 'submit a claim', 'raise a claim', 'open a claim',
  'claim status', 'track my claim', 'track claim', 'claim tracking',
  'claim number', 'claim reference', 'claim form', 'claim requirements',
  'claim documents', 'claim process', 'how to claim', 'claim procedure',
  'motor claim', 'accident claim', 'medical claim', 'death claim',
  'funeral claim', 'travel claim', 'wiba claim', 'theft claim',
  'fire claim', 'burglary claim', 'claim payout', 'claim settlement',
  'claim rejected', 'claim denied', 'claim approved', 'claim delay',
  'assessor', 'loss adjuster', 'excess', 'claim excess', 'accident report',
  'police abstract', 'garage', 'towing', 'writeoff', 'write-off',
]);

// A handful of generic words that show up in almost every product/company
// row and would otherwise blanket-match every message — excluded from ALL
// dynamic (DB-driven) term sets, not just products, for consistency.
const TERM_NOISE = new Set([
  'cic', 'plan', 'cover', 'policy', 'insurance', 'product', 'products', 'group',
  'and', 'the', 'for', 'with', 'our', 'your', 'company',
]);

function dedupe(arr) {
  return Array.from(new Set(arr.map(s => s.toLowerCase())));
}

// ---------------------------------------------------------------------------
// Scoring — replaces the old boolean "does any keyword substring appear"
// with a weighted raw score, later squashed into a 0-1 confidence value.
// Multi-word static phrases and DB-curated dynamic terms both count for
// more than a single generic word — see INTENT_ROUTER weights for why.
// ---------------------------------------------------------------------------
function staticPhraseScore(lowerMsg, phrases) {
  let raw = 0;
  for (const phrase of phrases) {
    if (lowerMsg.includes(phrase)) {
      raw += phrase.includes(' ')
        ? INTENT_ROUTER.STATIC_PHRASE_WEIGHT_MULTI
        : INTENT_ROUTER.STATIC_PHRASE_WEIGHT_SINGLE;
    }
  }
  return raw;
}

// Generic "does this message contain any known term from this set" check,
// shared by every dynamic (DB-driven) term source below. Returns the full
// list of matched terms (not just the first) so scoring reflects how many
// distinct DB-curated terms actually hit, and the first match doubles as
// the entity value (e.g. cityHint) where relevant.
function matchDynamicTerms(lowerMsg, termSet) {
  const matches = [];
  for (const term of termSet) {
    // Skip 1-2 char terms (stray short tags) to avoid noisy false positives.
    if (term.length > 2 && lowerMsg.includes(term)) matches.push(term);
  }
  return matches;
}

function dynamicTermScore(matches) {
  return matches.length * INTENT_ROUTER.DYNAMIC_TERM_WEIGHT;
}

// confidence = raw / (raw + K) — see INTENT_ROUTER.SOFTEN_K for the reasoning.
function toConfidence(raw) {
  return raw / (raw + INTENT_ROUTER.SOFTEN_K);
}

// ---------------------------------------------------------------------------
// Dynamic (DB-driven) term caches — one small factory instead of five
// copy-pasted cache blocks. Each entry is { label, ttlMs, load() } where
// load() runs the actual query and returns a Set<string> of lowercase terms.
// Cached in memory since these barely change and we don't want a DB round
// trip on every single message.
// ---------------------------------------------------------------------------
function createTermCache(label, ttlMs, load) {
  let cache = null;
  let expiry = 0;

  return async function getTerms() {
    const now = Date.now();
    if (cache && now < expiry) return cache;

    try {
      const terms = await load();
      cache = terms;
      expiry = now + ttlMs;
      return terms;
    } catch (err) {
      console.error(`[IntentRouter] Failed to load ${label} terms, falling back to static phrases only:`, err.message);
      // Don't cache the failure — retry next call — but return whatever we
      // had (possibly empty) so classifyIntent still works off static
      // phrases alone.
      return cache || new Set();
    }
  };
}

const getLocationTerms = createTermCache('branch location', RAG_CACHE.LOCATION_TTL_MS, async () => {
  const result = await query(`SELECT city, region, keywords FROM branches WHERE is_active = true`);
  const terms = new Set();
  for (const row of result.rows) {
    if (row.city) terms.add(row.city.toLowerCase());
    if (row.region) terms.add(row.region.toLowerCase());
    (row.keywords || []).forEach(kw => { if (kw) terms.add(kw.toLowerCase()); });
  }
  return terms;
});

const getProductTerms = createTermCache('product', RAG_CACHE.PRODUCT_TERM_TTL_MS, async () => {
  const result = await query(`SELECT name, keywords FROM insurance_products WHERE is_active = true`);
  const terms = new Set();
  for (const row of result.rows) {
    if (row.name) {
      row.name.toLowerCase().split(/\W+/)
        .filter(w => w.length > 2 && !TERM_NOISE.has(w))
        .forEach(w => terms.add(w));
    }
    (row.keywords || []).forEach(kw => {
      const clean = (kw || '').toLowerCase().trim();
      if (clean && !TERM_NOISE.has(clean)) terms.add(clean);
    });
  }
  return terms;
});

const getFAQTerms = createTermCache('FAQ', RAG_CACHE.FAQ_TERM_TTL_MS, async () => {
  // Only faq_entries.keywords (curated), not question/answer prose —
  // splitting long natural-language text into terms would just rebuild a
  // noisy, uncontrolled version of FAQ_PHRASES.
  const result = await query(`SELECT keywords FROM faq_entries WHERE is_active = true`);
  const terms = new Set();
  for (const row of result.rows) {
    (row.keywords || []).forEach(kw => {
      const clean = (kw || '').toLowerCase().trim();
      if (clean && clean.length > 2 && !TERM_NOISE.has(clean)) terms.add(clean);
    });
  }
  return terms;
});

// NEW — claims.keywords was previously unused by the router (claims relied
// entirely on the static CLAIMS_PHRASES list above). Same pattern as
// products/branches/FAQ, closing that gap.
const getClaimsTerms = createTermCache('claims', RAG_CACHE.CLAIMS_TERM_TTL_MS, async () => {
  const result = await query(`SELECT name, category, subcategory, keywords FROM claims WHERE is_active = true`);
  const terms = new Set();
  for (const row of result.rows) {
    [row.name, row.category, row.subcategory].forEach(field => {
      if (!field) return;
      field.toLowerCase().split(/\W+/)
        .filter(w => w.length > 2 && !TERM_NOISE.has(w))
        .forEach(w => terms.add(w));
    });
    (row.keywords || []).forEach(kw => {
      const clean = (kw || '').toLowerCase().trim();
      if (clean && clean.length > 2 && !TERM_NOISE.has(clean)) terms.add(clean);
    });
  }
  return terms;
});

// NEW — company_knowledge.tags was previously unused by the router (static
// COMPANY_PHRASES list only). Same pattern, closing the second gap.
const getCompanyTerms = createTermCache('company knowledge', RAG_CACHE.COMPANY_TERM_TTL_MS, async () => {
  const result = await query(`SELECT section, title, tags FROM company_knowledge WHERE is_active = true`);
  const terms = new Set();
  for (const row of result.rows) {
    [row.section, row.title].forEach(field => {
      if (!field) return;
      field.toLowerCase().split(/\W+/)
        .filter(w => w.length > 2 && !TERM_NOISE.has(w))
        .forEach(w => terms.add(w));
    });
    (row.tags || []).forEach(tag => {
      const clean = (tag || '').toLowerCase().trim();
      if (clean && clean.length > 2 && !TERM_NOISE.has(clean)) terms.add(clean);
    });
  }
  return terms;
});

// ---------------------------------------------------------------------------
// Intent registry — the local equivalent of a Dialogflow agent export.
// Declarative: name, static phrases, dynamic (DB) term source, priority
// (for tie-break suppression), and which lower-priority intents it
// suppresses when it wins. This replaces the two hardcoded if-blocks the
// original file used for the claims-override and product-override cases —
// adding a 6th table later means adding a registry entry, not new branches.
// ---------------------------------------------------------------------------
const INTENTS = [
  {
    key: 'claims',
    phrases: CLAIMS_PHRASES,
    dynamicTerms: getClaimsTerms,
    priority: 5, // highest — a claims-table match is the authoritative source for anything claim-shaped
    suppresses: ['faq', 'company'], // don't dilute/contradict claims data with generic FAQ/company rows
  },
  {
    key: 'products',
    phrases: PRODUCT_PHRASES,
    dynamicTerms: getProductTerms,
    priority: 4,
    suppresses: ['company'], // a named product match shouldn't also pull unrelated company_knowledge rows
  },
  {
    key: 'branches',
    phrases: BRANCH_PHRASES,
    dynamicTerms: getLocationTerms,
    priority: 3,
    entity: 'location',
  },
  {
    key: 'company',
    phrases: COMPANY_PHRASES,
    dynamicTerms: getCompanyTerms,
    priority: 2,
  },
  {
    key: 'faq',
    phrases: FAQ_PHRASES,
    dynamicTerms: getFAQTerms,
    priority: 1, // lowest — FAQ is the general/support catch-all
  },
];

// ---------------------------------------------------------------------------
// scoreIntents — runs the local weighted match for every registered intent.
// Always runs, regardless of whether Dialogflow is configured — this is the
// authoritative layer described in the file header.
// ---------------------------------------------------------------------------
async function scoreIntents(lowerMsg) {
  const scores = {};

  for (const intent of INTENTS) {
    const staticRaw = staticPhraseScore(lowerMsg, intent.phrases);
    const termSet = await intent.dynamicTerms();
    const dynamicMatches = matchDynamicTerms(lowerMsg, termSet);
    const raw = staticRaw + dynamicTermScore(dynamicMatches);

    scores[intent.key] = {
      raw,
      confidence: toConfidence(raw),
      matchedTerm: dynamicMatches[0] || null,
    };
  }

  return scores;
}

// ---------------------------------------------------------------------------
// applyDialogflowBoost — merges an (optional) Dialogflow result into the
// local scores. Dialogflow doesn't get to unilaterally decide an intent;
// it can only push a local score up (bounded at 1.0) and, when the intent
// it matched has zero local signal at all, register a floor confidence so
// a Dialogflow-only match (e.g. a cleverly-phrased English sentence with no
// keyword overlap) still clears the threshold.
// ---------------------------------------------------------------------------
function applyDialogflowBoost(scores, dfResult) {
  if (!dfResult) return { scores, cityHintFromDF: null };

  const { intentKey, confidence, cityHint } = dfResult;
  const existing = scores[intentKey];
  if (existing) {
    existing.confidence = Math.max(existing.confidence, confidence);
    existing.dialogflowMatched = true;
  }

  return { scores, cityHintFromDF: cityHint || null };
}

// ---------------------------------------------------------------------------
// applyPrioritySuppression — sorts intents by confidence, then lets the
// highest-scoring winner suppress whatever lower-priority intents it
// declares in `suppresses` (generalizes the old hardcoded claims/product
// overrides into config).
// ---------------------------------------------------------------------------
function applyPrioritySuppression(wants, scores) {
  const ranked = [...INTENTS].sort((a, b) => scores[b.key].confidence - scores[a.key].confidence);

  for (const intent of ranked) {
    if (!wants[intent.key] || !intent.suppresses) continue;
    for (const suppressedKey of intent.suppresses) {
      if (wants[suppressedKey]) {
        console.log(`[IntentRouter] "${intent.key}" intent (confidence ${scores[intent.key].confidence.toFixed(2)}) suppressing "${suppressedKey}"`);
        wants[suppressedKey] = false;
      }
    }
  }
  return wants;
}

// ---------------------------------------------------------------------------
// Context carryover — the local equivalent of a Dialogflow input/output
// context. If the current message alone doesn't clear the confidence
// threshold for anything, check whether recent USER turns (bounded by
// INTENT_ROUTER.CONTEXT_LIFESPAN_TURNS, i.e. a short "context lifespan")
// would, combined with the current message. This catches short ambiguous
// follow-ups like "how much is it" after "do you have WIBA cover".
// ---------------------------------------------------------------------------
async function tryContextCarryover(message, history) {
  if (!history || history.length === 0) return null;

  const recentUserTurns = history
    .filter(m => m.role === 'user')
    .slice(-INTENT_ROUTER.CONTEXT_LIFESPAN_TURNS)
    .map(m => m.content)
    .join(' ');

  if (!recentUserTurns) return null;

  const combinedLowerMsg = `${recentUserTurns} ${message}`.toLowerCase();
  const combinedScores = await scoreIntents(combinedLowerMsg);

  const winner = INTENTS
    .map(intent => ({ key: intent.key, confidence: combinedScores[intent.key].confidence }))
    .filter(s => s.confidence >= INTENT_ROUTER.CONFIDENCE_THRESHOLD)
    .sort((a, b) => b.confidence - a.confidence)[0];

  if (!winner) return null;

  console.log(`[IntentRouter] no direct match — context carryover from last ${INTENT_ROUTER.CONTEXT_LIFESPAN_TURNS} turn(s) inherited "${winner.key}" (${winner.confidence.toFixed(2)})`);
  return winner; // { key, confidence }
}

/**
 * classifyIntent(message, opts)
 *
 * opts:
 *   history:   array of { role, content } — same shape chatEngine.js
 *              already holds. Optional; passing it enables context
 *              carryover for ambiguous follow-ups. Backward compatible:
 *              omit it and the router behaves like a stateless classifier.
 *   sessionId: string — forwarded to Dialogflow (if enabled) to scope its
 *              own session; not required for local-only operation.
 *
 * Returns the same shape the original file returned, so chatEngine.js
 * needs zero changes beyond (optionally) passing { history, sessionId }:
 * {
 *   keywords:         string[]
 *   wantsFAQ:         boolean
 *   wantsProducts:    boolean
 *   wantsBranches:    boolean
 *   wantsCompanyInfo: boolean
 *   wantsClaims:      boolean
 *   cityHint:         string|null
 *   confidence:       { faq, products, branches, company, claims }  // NEW — for debugging/observability
 *   source:           'local' | 'local+dialogflow' | 'context'      // NEW
 * }
 */
async function classifyIntent(message, opts = {}) {
  const { history = [], sessionId = null } = opts;
  const lowerMsg = (message || '').toLowerCase();
  const keywords = extractKeywords(message);

  // ── Local scoring — always runs, always authoritative ──────────────────
  let scores = await scoreIntents(lowerMsg);

  // ── Optional Dialogflow boost — never blocks, never throws ─────────────
  const dfResult = await detectDialogflowIntent(message, sessionId);
  const { cityHintFromDF } = applyDialogflowBoost(scores, dfResult);

  let wants = {};
  for (const intent of INTENTS) {
    wants[intent.key] = scores[intent.key].confidence >= INTENT_ROUTER.CONFIDENCE_THRESHOLD;
  }

  wants = applyPrioritySuppression(wants, scores);

  let source = dfResult ? 'local+dialogflow' : 'local';
  const noneMatched = Object.values(wants).every(v => !v);

  if (noneMatched) {
    const inherited = await tryContextCarryover(message, history);
    if (inherited) {
      wants[inherited.key] = true;
      scores[inherited.key].confidence = inherited.confidence;
      source = 'context';
    }
  }

  // Default Fallback Intent equivalent — FAQ + company are the most
  // general-purpose content, so they're the cheapest, safest fallback for
  // ambiguous input ("hi", "thanks", "tell me more") rather than querying
  // every table blindly.
  if (Object.values(wants).every(v => !v)) {
    wants.faq = true;
    wants.company = true;
  }

  const branchTermMatch = scores.branches.matchedTerm;
  const cityMatch = (message || '').match(/(?:in|at|near|around)\s+(\w+)/i);
  const cityHint = wants.branches
    ? (cityHintFromDF || branchTermMatch || (cityMatch ? cityMatch[1] : null))
    : null;

  console.log(
    `[IntentRouter/${source}] "${(message || '').substring(0, 60)}" -> ` +
    `faq:${wants.faq}(${scores.faq.confidence.toFixed(2)}) ` +
    `products:${wants.products}(${scores.products.confidence.toFixed(2)}) ` +
    `branches:${wants.branches}(${scores.branches.confidence.toFixed(2)}) ` +
    `company:${wants.company}(${scores.company.confidence.toFixed(2)}) ` +
    `claims:${wants.claims}(${scores.claims.confidence.toFixed(2)})`
  );

  return {
    keywords,
    wantsFAQ: wants.faq,
    wantsProducts: wants.products,
    wantsBranches: wants.branches,
    wantsCompanyInfo: wants.company,
    wantsClaims: wants.claims,
    cityHint,
    confidence: {
      faq: scores.faq.confidence,
      products: scores.products.confidence,
      branches: scores.branches.confidence,
      company: scores.company.confidence,
      claims: scores.claims.confidence,
    },
    source,
  };
}

module.exports = { classifyIntent };
