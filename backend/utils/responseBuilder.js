/**
 * Response builders with session expiration messaging
 * 
 * Handles consistent formatting of warnings and session state
 */

/**
 * Build chat response with optional session expiration warning
 */
function buildChatResponse(data) {
  const {
    response,
    sessionId,
    timestamp = new Date().toISOString(),
    sessionStatus = {},
  } = data;

  const baseResponse = {
    response,
    sessionId,
    timestamp,
    session: {
      isActive: sessionStatus.isActive !== false,
      timeRemainingSeconds: Math.ceil(sessionStatus.timeRemainingMs / 1000),
    },
  };

  // Add warning if expiration is imminent
  if (sessionStatus.warningNeeded) {
    baseResponse.warning = {
      type: 'session_expiring_soon',
      message: `Your conversation will close in ${Math.ceil(sessionStatus.timeRemainingMs / 1000)} seconds due to inactivity.`,
      timeRemainingSeconds: Math.ceil(sessionStatus.timeRemainingMs / 1000),
      action: 'Send a message to reset the timer',
    };
  }

  return baseResponse;
}

/**
 * Build response for expired sessions
 */
function buildSessionExpiredResponse(sessionId) {
  return {
    error: 'session_expired',
    message: 'Your conversation has expired due to inactivity. A new session will be started.',
    sessionId: null, // Client should request new session
    newSessionId: null, // To be generated on next message
    timestamp: new Date().toISOString(),
    reason: 'inactivity',
    suggestedAction: 'Send your message to start a new conversation',
  };
}

/**
 * Build response for new sessions
 */
function buildNewSessionResponse(sessionId) {
  return {
    isNewSession: true,
    sessionId,
    message: 'Starting a new conversation',
    timestamp: new Date().toISOString(),
  };
}

/**
 * Escalate to human agent response
 */
function buildEscalationResponse() {
  return {
    response: `I've escalated your request to our customer support team. They will assist you shortly.

📞 In the meantime, you can also:
• Call our customer care: +254 XX XXX XXXX
• Visit our website: www.cicgroup.com
• Find a nearby branch

Your reference ID: ${generateReferenceId()}`,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Error response builder
 */
function buildErrorResponse(error, sessionId) {
  console.error('Chat error:', error);

  return {
    error: 'chat_error',
    message: 'An error occurred while processing your message. Please try again.',
    sessionId,
    timestamp: new Date().toISOString(),
    details: process.env.NODE_ENV === 'development' ? error.message : undefined,
  };
}

/**
 * Generate unique reference ID for escalations
 */
function generateReferenceId() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `${timestamp}${random}`;
}

module.exports = {
  buildChatResponse,
  buildSessionExpiredResponse,
  buildNewSessionResponse,
  buildEscalationResponse,
  buildErrorResponse,
  generateReferenceId,
};
