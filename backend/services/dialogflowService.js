//
// dialogflowService — thin wrapper around Dialogflow ES's detectIntent API.
//
// This is the "cloud" half of the hybrid intent router (see
// utils/intentRouter.js for the full picture). It is intentionally dumb:
// one function, detectDialogflowIntent(message, sessionId), that either
// returns a normalized { intentKey, confidence, params, cityHint } result
// or `null`. It NEVER throws — every failure mode (missing credentials,
// feature flag off, network error, timeout, low confidence, fallback
// intent, non-English input) collapses to `null`, because the router
// treats Dialogflow as an optional confidence booster, not a dependency.
// The local, DB-keyword-driven classifier in intentRouter.js is always the
// authoritative fallback — see that file's header comment for why we don't
// trust Dialogflow alone (no Swahili/Sheng support, external latency, and
// it can't see product/claims rows added to Postgres after the agent was
// last trained).
//
// Setup: see docs/DialogflowHybridSetup.md for the full console + GCP
// walkthrough (creating the agent, intents, entities, service account).
//
// Required env vars (all optional — service silently no-ops if missing):
//   DIALOGFLOW_ENABLED=true
//   DIALOGFLOW_PROJECT_ID=<gcp project id>
//   GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json
//   DIALOGFLOW_TIMEOUT_MS=800          (optional, default below)
//   DIALOGFLOW_MIN_CONFIDENCE=0.4      (optional, default below)
//

const DEFAULT_TIMEOUT_MS = 800; // must stay well under the customer's perceived latency budget
const DEFAULT_MIN_CONFIDENCE = 0.4;

const ENABLED = process.env.DIALOGFLOW_ENABLED === 'true';
const PROJECT_ID = process.env.DIALOGFLOW_PROJECT_ID;
const TIMEOUT_MS = parseInt(process.env.DIALOGFLOW_TIMEOUT_MS, 10) || DEFAULT_TIMEOUT_MS;
const MIN_CONFIDENCE = parseFloat(process.env.DIALOGFLOW_MIN_CONFIDENCE) || DEFAULT_MIN_CONFIDENCE;

// ---------------------------------------------------------------------------
// Maps Dialogflow ES intent *display names* (set in the console, see setup
// doc) to the same intent keys the local router uses. Keep this in sync
// with whatever you name the intents in the Dialogflow console — this is
// the ONE place that translation happens.
// ---------------------------------------------------------------------------
const DIALOGFLOW_INTENT_MAP = {
  'faq.general': 'faq',
  'products.inquiry': 'products',
  'branches.locate': 'branches',
  'company.info': 'company',
  'claims.file': 'claims',
};

let sessionsClient = null;
let clientInitFailed = false;

function getClient() {
  if (sessionsClient || clientInitFailed) return sessionsClient;
  try {
    // Lazy require — keeps @google-cloud/dialogflow (and its gRPC deps) out
    // of the boot path entirely when the feature is disabled, which is the
    // default for anyone who hasn't set up a GCP project yet.
    const { SessionsClient } = require('@google-cloud/dialogflow');
    sessionsClient = new SessionsClient();
  } catch (err) {
    console.error('[Dialogflow] Failed to initialize SessionsClient — falling back to local intent router only:', err.message);
    clientInitFailed = true;
  }
  return sessionsClient;
}

// ---------------------------------------------------------------------------
// Startup diagnostics — runs ONCE, at process boot, only when
// DIALOGFLOW_ENABLED=true. A misconfigured Dialogflow setup (bad path, bad
// credentials, unreachable project) should never fail silently as a wall of
// repeating per-message errors buried in normal traffic — it should say so
// loudly, once, right when the server starts.
// ---------------------------------------------------------------------------
async function runStartupDiagnostics() {
  if (!ENABLED) return;

  console.log('[Dialogflow] DIALOGFLOW_ENABLED=true — running startup diagnostics...');

  if (!PROJECT_ID) {
    console.error('[Dialogflow] ❌ DIALOGFLOW_PROJECT_ID is not set. Hybrid boost will be OFF for every message until this is fixed.');
    return;
  }

  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credPath) {
    console.error('[Dialogflow] ❌ GOOGLE_APPLICATION_CREDENTIALS is not set. Hybrid boost will be OFF for every message until this is fixed.');
    return;
  }

  const fs = require('fs');
  if (!fs.existsSync(credPath)) {
    console.error(
      `[Dialogflow] ❌ GOOGLE_APPLICATION_CREDENTIALS points to a file that does not exist:\n` +
      `    "${credPath}"\n` +
      `    Check for typos, stray quote characters (e.g. a leading r" from copy-pasting a ` +
      `Python string), or a OneDrive "online-only" placeholder file. Hybrid boost will be ` +
      `OFF for every message until this resolves.`
    );
    return;
  }

  // Credentials file exists and env vars are set — now actually confirm the
  // API is reachable with a trivial self-test call, so a bad project ID,
  // unpublished agent, or revoked service account also surfaces at boot
  // rather than on the first real customer message.
  const result = await detectDialogflowIntent('hello', 'startup-selftest');
  if (result) {
    console.log(`[Dialogflow] ✅ Self-test succeeded — matched "${result.intentKey}" at confidence ${result.confidence.toFixed(2)}. Hybrid boost is LIVE.`);
  } else {
    console.warn(
      '[Dialogflow] ⚠️  Self-test call completed without throwing, but returned no confident match ' +
      '(fell to Default Fallback Intent, or scored below DIALOGFLOW_MIN_CONFIDENCE). This can be normal ' +
      'for a bare "hello" if you have no smalltalk intent — send a real product/branch/claims-style ' +
      'message through the chat and check for the "[IntentRouter/local+dialogflow]" log prefix to confirm ' +
      'end-to-end. If you never see that prefix, double-check your intent display names match ' +
      'DIALOGFLOW_INTENT_MAP exactly.'
    );
  }
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('dialogflow_timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * detectDialogflowIntent(message, sessionId)
 *
 * Returns:
 *   {
 *     intentKey:  'faq'|'products'|'branches'|'company'|'claims',
 *     confidence: number,        // Dialogflow's detectIntentConfidence, 0-1
 *     params:     object,        // extracted entity parameters (raw)
 *     cityHint:   string|null,   // convenience: params.city / params['geo-city'] if present
 *   }
 *   or `null` if Dialogflow is disabled, unavailable, timed out, returned
 *   the Default Fallback Intent, or scored below DIALOGFLOW_MIN_CONFIDENCE.
 *
 * `sessionId` should be the same chat session id you already track
 * (sessionManager.js) — Dialogflow uses it only to scope its own internal
 * contexts, we don't rely on that state, so any stable string is fine.
 */
async function detectDialogflowIntent(message, sessionId) {
  if (!ENABLED || !PROJECT_ID || !message) return null;

  const client = getClient();
  if (!client) return null;

  try {
    const sessionPath = client.projectAgentSessionPath(PROJECT_ID, sessionId || 'anon');

    const request = {
      session: sessionPath,
      queryInput: {
        text: {
          text: message,
          languageCode: 'en', // agent's default language — see setup doc on why we don't add 'sw'
        },
      },
    };

    const [response] = await withTimeout(client.detectIntent(request), TIMEOUT_MS);
    const result = response.queryResult;

    if (!result || !result.intent || result.intent.isFallback) {
      return null; // Default Fallback Intent — let the local router decide
    }

    const confidence = result.intentDetectionConfidence || 0;
    if (confidence < MIN_CONFIDENCE) {
      return null; // too unsure to override/boost the local score
    }

    const intentKey = DIALOGFLOW_INTENT_MAP[result.intent.displayName];
    if (!intentKey) {
      // Matched an intent that isn't wired into our table map (e.g. a
      // smalltalk intent you added later) — nothing for the router to do.
      return null;
    }

    // result.parameters is a protobuf Struct; .fields is the raw map.
    // structProtoToJs is a tiny local helper (below) instead of pulling in
    // the full protobuf/struct.js package for one conversion.
    const params = structProtoToJs(result.parameters);
    const cityHint = params.city || params['geo-city'] || params.location || null;

    return { intentKey, confidence, params, cityHint };
  } catch (err) {
    if (err.message !== 'dialogflow_timeout') {
      console.error('[Dialogflow] detectIntent failed — falling back to local intent router:', err.message);
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Minimal protobuf Struct -> plain object conversion, just for the handful
// of scalar entity types (@sys.geo-city, custom @product, @branch-city,
// @claim-type) this agent uses. Doesn't handle nested structs/lists because
// none of our entities need them — extend if you add a composite entity.
// ---------------------------------------------------------------------------
function structProtoToJs(struct) {
  if (!struct || !struct.fields) return {};
  const out = {};
  for (const [key, value] of Object.entries(struct.fields)) {
    if (value.stringValue !== undefined && value.stringValue !== '') {
      out[key] = value.stringValue;
    } else if (value.numberValue !== undefined) {
      out[key] = value.numberValue;
    }
  }
  return out;
}

module.exports = { detectDialogflowIntent, DIALOGFLOW_INTENT_MAP, ENABLED, runStartupDiagnostics };
