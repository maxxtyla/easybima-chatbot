//
// Deterministic, rule-based priority scoring. Deliberately NOT ML-driven —
// tickets feed a regulated insurer's customer care queue, and every score
// needs to be explainable to a supervisor without "the model decided so."
//
// computeTicketPriority() returns both the tier (what agents sort/filter
// by) and the raw score + matched signals (what justifies it later, and
// what you'd tune if the thresholds turn out wrong in practice).

const URGENT_KEYWORDS = ['emergency', 'urgent', 'asap', 'accident', 'dispute'];
const COMPLAINT_KEYWORDS = ['complaint', 'escalate', 'manager', 'supervisor', 'terrible', 'awful'];

const SLA_HOURS_BY_TIER = {
  urgent: 1,
  high: 4,
  medium: 24,
  low: 72,
};

function scoreToTier(score) {
  if (score >= 6) return 'urgent';
  if (score >= 4) return 'high';
  if (score >= 2) return 'medium';
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

  if (sentiment === 'angry') {
    score += 2;
    signals.push('angry_sentiment');
  }

  if (URGENT_KEYWORDS.some(kw => lowerMessage.includes(kw))) {
    score += 2;
    signals.push('urgent_keyword');
  }

  if (COMPLAINT_KEYWORDS.some(kw => lowerMessage.includes(kw))) {
    score += 2;
    signals.push('complaint_keyword');
  }

  if (category === 'claim' || category === 'complaint') {
    score += 1;
    signals.push('sensitive_category');
  }

  if (isRepeatEscalation) {
    score += 1;
    signals.push('repeat_escalation');
  }

  const tier = scoreToTier(score);
  const slaHours = SLA_HOURS_BY_TIER[tier];
  const slaDueAt = new Date(Date.now() + slaHours * 60 * 60 * 1000);

  return { tier, score, signals, slaDueAt };
}

module.exports = { computeTicketPriority, SLA_HOURS_BY_TIER };
