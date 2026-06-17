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

  // Add warning if session is expiring soon (< 2 minutes)
  if (sessionStatus.timeRemainingMs < 120000 && sessionStatus.timeRemainingMs > 0) {
    result.warning = {
      type: 'session_expiring_soon',
      message: 'Your session will expire soon due to inactivity.',
      timeRemainingSeconds: Math.ceil(sessionStatus.timeRemainingMs / 1000),
      action: 'Send a message or click keep-alive to continue',
    };
  }

  return result;
}

function buildSessionExpiredResponse(sessionId) {
  return {
    response: "Your session has expired due to inactivity. I've started a fresh conversation — how can I help you?",
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
  return {
    response:
      "I understand you need extra assistance. Let me connect you with one of our specialists.\n\n" +
      "📞 **Call us:** +254 20 2823000\n" +
      "📧 **Email:** info@cicinsurancegroup.com\n" +
      "🌐 **Website:** https://www.cicinsurancegroup.com\n\n" +
      "Our team is available Monday–Friday, 8:00 AM – 5:00 PM EAT. Is there anything else I can help with in the meantime?",
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