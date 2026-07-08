//
// intentRouter — decides WHICH tables in the schema are worth querying for
// a given user message, instead of hitting every RAG table on every turn.
//
// Tables covered (see schema.sql):
//   - faq_entries          -> wantsFAQ
//   - insurance_products   -> wantsProducts
//   - branches             -> wantsBranches
//   - company_knowledge    -> wantsCompanyInfo
//
// `analytics`, `conversations`, and `messages` are never part of retrieval
// routing — they're logging/history tables, not RAG sources, and are
// handled separately by conversationService.js.
//
// This is intentionally simple keyword matching (fast, no extra LLM call,
// no added latency) rather than an ML classifier — good enough because the
// domain vocabulary (branches/offices vs. products/cover vs. claims/renew
// vs. about/history) barely overlaps.
//

const { extractKeywords } = require('./keywords');
const { query } = require('../config/database');

const BRANCH_KEYWORDS = [
  'branch', 'branches', 'office', 'location', 'near me', 'find', 'where',
  'visit', 'address', 'directions', 'contact', 'phone number', 'email address',
];

const PRODUCT_KEYWORDS = [
  'product', 'products', 'cover', 'coverage', 'insure', 'insurance', 'policy',
  'plan', 'benefit', 'benefits', 'offer', 'motor', 'car insurance', 'health',
  'medisure','family','health','medical','inpatient','outpatient','hospital','diagnostics','chemotherapy','surgery','dependants',
  'group','personal accident','funeral','death','children','adults','group cover', 'benefit',
  'medical', 'life insurance', 'travel insurance', 'marine', 'wiba',
  'SME','medipack','small business','health','medical','inpatient','outpatient','maternity','dental','optical','group medical','employees','sme',
  'WIBA','work injury','employees','bodily injury','occupational disease','employer','workplace','work injury benefits act','work injury benefits','workers compensation','workers comp','workers compensation insurance',
  'indemnity', 'liability', 'malpractice', 'negligence', 'errors', 'omissions', 'lawyer', 'doctor', 'engineer', 'consultant', 'professional',
  'personal accident', 'education policy', 'pension', 'quote', 'premium',
  'fixed income','fixed money','fixed',
  'Dollar','$','usa','United states Dollar',
  'Wealth fund',
  'invest','MMF','mmf','moneymarket','moneymarketfund','money','moneyfund','money market fund','money market','money market fund','money market funds','money market investment','money market investments',
  'afya bora', 'affordable', 'family', 'health', 'inpatient', 'outpatient', 'children', 'parents', 'low cost', 'basic cover', '32000',
  'micro','jilinde','micro enterprise','SME','bodily injury','employees','workplace',
  'personal accident', 'injury', 'disability', 'death', 'medical expenses', 'funeral expenses', 'accident', 'died',
  'golfer','sportsman','sports','athlete','accident','disability','career',
  'domestic','home','house','property','buildings','contents','household','liability','domestic servant',
  'student','personal accident','injury','disability','death','medical expenses','funeral','school',
  'travel','holiday','trip','baggage','flight cancellation','medical','fly','abroad','tourist',
  'what do you', 'buy', 'purchase', 'sign up', 'get covered', 'recommend',
  'seniors','mediplan','elderly',"old age",'senior citizen','health','medical','60 years','80 years','geriatric','chronic','dental','optical',
  'private motor', 'monthly', 'vehicle', 'motor insurance', 'easy bima', 'installment',
  'cargo','transit','goods','merchandise','sea','air','rail','road','ICC-A','import','export','shipping',
  'commercial','vehicle','third party','bodily injury','property damage','driver','passengers','car','road',
  'student','personal accident','bodily injury','work insurance','accidental','violent','industry attachment insurance'
];

const COMPANY_KEYWORDS = [
  'about', 'history', 'company', 'cic', 'group', 'mission', 'vision',
  'founded', 'when was', 'leadership', 'ceo', 'chairman', 'subsidiary', 'company', 'history', 'overview',
  'subsidiaries', 'sustainability', 'careers', 'annual report', 'who are you',
  'X','twitter','social media','socialmedia','online platforms','linked in',
  'youtube','instagram','facebook',
  'job', 'opportunity', 'career', 'work', 'intern', 'jobs', 'hiring', 'new employees',
  'abroad branches', 'subsidiaries', 'outside kenya', 'malawi', 'uganda', 'ug', 'ke', 's.sudan', 'south sudan', 'diaspora',
  'who is cic', 'staff', 'directors', 'leaders', 'leadership Team', 'organization structure', 'CEO', 'managing directors'
];

// FAQ is the general support/process table: claims, renewals, cancellations,
// payments, complaints, "how do I..." questions. It's also the safe default
// fallback when nothing else matches (see below).
const FAQ_KEYWORDS = [
  'how do i', 'how to', 'claim', 'claims', 'renew', 'renewal', 'cancel',
  'cancellation', 'pay', 'payment', 'refund', 'complaint', 'complain',
  'document', 'documents', 'requirements', 'process', 'steps', 'apply',
  'application', 'help', 'faq', 'question',
];

function matchesAny(lowerMsg, keywordList) {
  return keywordList.some(kw => lowerMsg.includes(kw));
}

// ---------------------------------------------------------------------------
// Known branch locations — pulled from branches.city / branches.region /
// branches.keywords so that mentioning a place name alone ("accident in
// Bungoma") triggers branch retrieval, even without a generic word like
// "branch" or "office" in the message. BRANCH_KEYWORDS above stays as the
// static fallback for phrasing like "where can I find you".
//
// Cached in memory (5 min TTL) since this list barely changes and we don't
// want a DB round trip on every single message.
// ---------------------------------------------------------------------------
const LOCATION_CACHE_TTL_MS = 5 * 60 * 1000;
let locationCache = null; // Set<string>
let locationCacheExpiry = 0;

async function getKnownLocationTerms() {
  const now = Date.now();
  if (locationCache && now < locationCacheExpiry) {
    return locationCache;
  }

  try {
    const result = await query(
      `SELECT city, region, keywords FROM branches WHERE is_active = true`
    );

    const terms = new Set();
    for (const row of result.rows) {
      if (row.city) terms.add(row.city.toLowerCase());
      if (row.region) terms.add(row.region.toLowerCase());
      (row.keywords || []).forEach(kw => {
        if (kw) terms.add(kw.toLowerCase());
      });
    }

    locationCache = terms;
    locationCacheExpiry = now + LOCATION_CACHE_TTL_MS;
    return terms;
  } catch (err) {
    console.error('[IntentRouter] Failed to load branch locations, falling back to static keywords only:', err.message);
    // Don't cache the failure — retry next call — but return an empty set
    // for this call so classifyIntent still works off BRANCH_KEYWORDS alone.
    return locationCache || new Set();
  }
}

function matchesLocation(lowerMsg, locationTerms) {
  for (const term of locationTerms) {
    // Skip 1-2 char terms (e.g. stray short tags) to avoid noisy false positives
    if (term.length > 2 && lowerMsg.includes(term)) return term;
  }
  return null;
}

/**
 * classifyIntent(message)
 *
 * Returns:
 * {
 *   keywords:         string[]  // extracted, stop-word-filtered search terms
 *   wantsFAQ:         boolean
 *   wantsProducts:    boolean
 *   wantsBranches:    boolean
 *   wantsCompanyInfo: boolean
 *   cityHint:         string|null  // parsed city, e.g. "near Mombasa" -> "Mombasa"
 * }
 *
 * If NOTHING matches (e.g. "hi", "thanks", "tell me more", small talk),
 * we default wantsFAQ + wantsCompanyInfo to true. Those two hold the most
 * general-purpose content, so they're the cheapest, safest fallback for
 * ambiguous input rather than querying every table blindly.
 *
 * NOTE: now async — wantsBranches also checks the message against known
 * branch city/region/keyword tags (cached from the DB), not just the
 * static BRANCH_KEYWORDS list, so "accident in Bungoma" correctly pulls
 * the Bungoma branch even without the word "branch" anywhere in it.
 */
async function classifyIntent(message) {
  const lowerMsg = (message || '').toLowerCase();
  const keywords = extractKeywords(message);

  let wantsFAQ = matchesAny(lowerMsg, FAQ_KEYWORDS);
  let wantsProducts = matchesAny(lowerMsg, PRODUCT_KEYWORDS);
  let wantsCompanyInfo = matchesAny(lowerMsg, COMPANY_KEYWORDS);

  const branchKeywordHit = matchesAny(lowerMsg, BRANCH_KEYWORDS);

  const locationTerms = await getKnownLocationTerms();
  const matchedLocation = matchesLocation(lowerMsg, locationTerms);

  let wantsBranches = branchKeywordHit || Boolean(matchedLocation);

  const cityMatch = (message || '').match(/(?:in|at|near|around)\s+(\w+)/i);
  const cityHint = wantsBranches ? (matchedLocation || (cityMatch ? cityMatch[1] : null)) : null;

  const noIntentMatched =
    !wantsFAQ && !wantsProducts && !wantsBranches && !wantsCompanyInfo;

  if (noIntentMatched) {
    wantsFAQ = true;
    wantsCompanyInfo = true;
  }

  return { keywords, wantsFAQ, wantsProducts, wantsBranches, wantsCompanyInfo, cityHint };
}

module.exports = { classifyIntent };