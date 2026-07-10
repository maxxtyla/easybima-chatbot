function buildChatResponse({ response, sessionId, sessionStatus }) {
  const result = {
    response,
    sessionId,
    timestamp: new Date().toISOString(),
    session: {
      isActive: sessionStatus.isActive,
      timeRemainingSeconds: Math.ceil(sessionStatus.timeRemainingMs / 1000),
    },
  };

  // Nudge toward wrapping up when the session is getting close to timing
  // out — phrased as a natural closing question, not "your session is
  // about to expire" technical/alarming language.
  if (sessionStatus.timeRemainingMs < 120000 && sessionStatus.timeRemainingMs > 0) {
    result.warning = {
      type: 'wrap_up_prompt',
      message: 'Is there anything else I can help you with?',
      timeRemainingSeconds: Math.ceil(sessionStatus.timeRemainingMs / 1000),
    };
  }

  return result;
}

function buildSessionExpiredResponse(sessionId) {
  return {
    response: "Hi! I'm Bima, your CIC Insurance assistant. How can I help you today?",
    sessionId,
    timestamp: new Date().toISOString(),
    session: {
      isActive: false,
      timeRemainingSeconds: 0,
    },
    sessionExpired: true,
  };
}

function buildNewSessionResponse(sessionId) {
  return {
    response: "Welcome! I'm Bima, your CIC Insurance assistant. How can I help you today?",
    sessionId,
    timestamp: new Date().toISOString(),
    session: {
      isActive: true,
      timeRemainingSeconds: 1800,
    },
    isNewSession: true,
  };
}

function buildEscalationResponse() {
  // BUG FIX: this used to end with "Is there anything else I can help
  // with in the meantime?" — a leftover closing question that doesn't
  // make sense right after the customer has just been handed off to a
  // live agent. It read as if the bot was still fishing for small talk
  // instead of stepping back, so it's dropped here.
  return {
    response:
      "I understand you need extra assistance. I've created a ticket and one of our specialists will pick it up and reply to you right here in this chat.\n\n" +
      "If you'd rather reach us directly in the meantime:\n" +
      "📞 **Call us:** +254 20 2823000\n" +
      "📧 **Email:** info@cicinsurancegroup.com\n" +
      "🌐 **Website:** https://www.cicinsurancegroup.com\n\n" +
      "Our team is available Monday–Friday, 8:00 AM – 5:00 PM EAT.",
    timestamp: new Date().toISOString(),
  };
}

function buildErrorResponse(error, sessionId) {
  const isDev = process.env.NODE_ENV !== 'production';
  return {
    error: 'internal_server_error',
    message: 'Something went wrong. Please try again.',
    sessionId: sessionId || null,
    timestamp: new Date().toISOString(),
    ...(isDev && { debug: error?.message }),
  };
}

module.exports = {
  buildChatResponse,
  buildSessionExpiredResponse,
  buildNewSessionResponse,
  buildEscalationResponse,
  buildErrorResponse,
};