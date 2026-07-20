//
// Deterministic, rule-based priority scoring. Deliberately NOT ML-driven —
// tickets feed a regulated insurer's customer care queue, and every score
// needs to be explainable to a supervisor without "the model decided so."
//
// computeTicketPriority() returns both the tier (what agents sort/filter
// by) and the raw score + matched signals (what justifies it later, and
// what you'd tune if the thresholds turn out wrong in practice).

const { TICKET_PRIORITY } = require('../config/constants');

const URGENT_KEYWORDS = ['emergency', 'urgent', 'asap', 'accident', 'dispute'];
const COMPLAINT_KEYWORDS = ['complaint', 'escalate', 'manager', 'supervisor', 'terrible', 'awful'];

const SLA_HOURS_BY_TIER = TICKET_PRIORITY.SLA_HOURS_BY_TIER;
const { urgent: URGENT_THRESHOLD, high: HIGH_THRESHOLD, medium: MEDIUM_THRESHOLD } =
  TICKET_PRIORITY.TIER_THRESHOLDS;

function scoreToTier(score) {
  if (score >= URGENT_THRESHOLD) return 'urgent';
  if (score >= HIGH_THRESHOLD) return 'high';
  if (score >= MEDIUM_THRESHOLD) return 'medium';
  return 'low';
}

/**
 * @param {Object} input
 * @param {string} input.message - the triggering user message
 * @param {'angry'|'happy'|'neutral'} [input.sentiment]
 * @param {string} [input.category] - 'claim' | 'complaint' | 'billing' | etc.
 * @param {boolean} [input.isRepeatEscalation] - this session has escalated before
 * @returns {{ tier: string, score: number, signals: string[], slaDueAt: Date }}
 */
function computeTicketPriority({ message = '', sentiment = 'neutral', category, isRepeatEscalation = false }) {
  const lowerMessage = message.toLowerCase();
  const signals = [];
  let score = 0;

  const WEIGHTS = TICKET_PRIORITY.SIGNAL_WEIGHTS;

  if (sentiment === 'angry') {
    score += WEIGHTS.ANGRY_SENTIMENT;
    signals.push('angry_sentiment');
  }

  if (URGENT_KEYWORDS.some(kw => lowerMessage.includes(kw))) {
    score += WEIGHTS.URGENT_KEYWORD;
    signals.push('urgent_keyword');
  }

  if (COMPLAINT_KEYWORDS.some(kw => lowerMessage.includes(kw))) {
    score += WEIGHTS.COMPLAINT_KEYWORD;
    signals.push('complaint_keyword');
  }

  if (category === 'claim' || category === 'complaint') {
    score += WEIGHTS.SENSITIVE_CATEGORY;
    signals.push('sensitive_category');
  }

  if (isRepeatEscalation) {
    score += WEIGHTS.REPEAT_ESCALATION;
    signals.push('repeat_escalation');
  }

  const tier = scoreToTier(score);
  const slaHours = SLA_HOURS_BY_TIER[tier];
  const slaDueAt = new Date(Date.now() + slaHours * 60 * 60 * 1000);

  return { tier, score, signals, slaDueAt };
}

module.exports = { computeTicketPriority, SLA_HOURS_BY_TIER };