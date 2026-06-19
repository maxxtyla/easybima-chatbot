// ---------------------------------------------------------------------------
// sanitizeResponse.js
//
// Last line of defense against internal model reasoning / chain-of-thought
// leaking into a customer-facing message. Some reasoning-capable models
// (especially free/experimental ones served via OpenRouter) sometimes put
// their raw internal monologue directly in the "content" field instead of
// a clean answer — with or without wrapper tags. This must never reach the
// frontend, get persisted to the conversation history, or be logged
// anywhere a customer could see it.
//
// This module is intentionally used in more than one place (claudeService
// right after extracting the model's reply, AND chatControllerV2 right
// before the reply is persisted/returned) so a future code path can't
// silently reintroduce a leak.
// ---------------------------------------------------------------------------

// Tags some reasoning models wrap their internal chain-of-thought in.
const THINK_TAG_PATTERN = /<\s*(think|thinking|reasoning|analysis|scratchpad|reflection)\s*>[\s\S]*?<\s*\/\s*\1\s*>/gi;

// Catches an *unclosed* opening tag through to the end of the string —
// some providers truncate output mid-thought when max_tokens is hit,
// leaving a dangling <think> with no closing tag.
const UNCLOSED_THINK_TAG_PATTERN = /<\s*(think|thinking|reasoning|analysis|scratchpad|reflection)\s*>[\s\S]*$/gi;

// Heuristic signature of raw, untagged chain-of-thought that some free
// models emit directly as "content" with no wrapper tags at all — e.g.
// narrating "We need answer as Bima. User asks ... Need maybe ...".
// Anchored to the start of the text (after trimming) to avoid
// false-positives on legitimate customer-facing replies that happen to
// mention these words mid-sentence.
const RAW_COT_SIGNATURE = /^\s*(we need|let me think|i need to (figure|work|decide)|the user (is asking|wants|asked)|need (to )?(answer|check|figure|decide|clarify)|okay,? (let's|let me)|thinking:|analysis:|let's (think|see|figure))/i;

function stripThinkTags(text) {
  if (!text) return text;
  return text
    .replace(THINK_TAG_PATTERN, '')
    .replace(UNCLOSED_THINK_TAG_PATTERN, '')
    .trim();
}

/**
 * Returns a sanitized, customer-safe version of `text`, or null if the
 * text appears to BE internal reasoning rather than a real answer. Callers
 * MUST treat null as a failed generation — never forward it to the user,
 * never persist it to conversation history, never show it in the UI.
 */
function sanitizeForUser(text) {
  if (!text || typeof text !== 'string') return null;

  const stripped = stripThinkTags(text);
  if (!stripped) return null;

  if (RAW_COT_SIGNATURE.test(stripped)) {
    return null;
  }

  return stripped;
}

module.exports = { sanitizeForUser, stripThinkTags };