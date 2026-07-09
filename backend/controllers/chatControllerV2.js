const chatEngine = require('../services/chatEngine');
const {
  checkSessionStatus,
  recoverSessionFromDB,
  getConversationWithExpirationCheck,
  updateSessionActivity,
  endSessionInMemory,
} = require('../services/sessionManager');
const { logAnalytics, deleteConversationData } = require('../services/conversationService');
const {
  buildChatResponse,
  buildSessionExpiredResponse,
  buildErrorResponse,
} = require('../utils/responseBuilder');

/**
 * POST /api/chat
 * Thin HTTP adapter around chatEngine.processMessage — all RAG/Claude/
 * session logic lives in services/chatEngine.js so it stays identical
 * across the web widget and WhatsApp.
 */
async function handleChat(req, res) {
  const { message, sessionId: providedSessionId } = req.body;
  let sessionId = providedSessionId;

  try {
    const result = await chatEngine.processMessage({
      message,
      sessionId: providedSessionId,
      meta: {
        channel: 'web',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    sessionId = result.sessionId;

    if (result.humanHandled) {
      // Agent has taken this session over — message is already logged for
      // them to see; no bot reply to send. The widget should stop showing
      // a typing indicator and start polling for the agent's reply.
      return res.json({
        response: null,
        sessionId,
        humanHandled: true,
        session: {
          isActive: true,
          timeRemainingSeconds: Math.ceil(result.sessionStatus.timeRemainingMs / 1000),
        },
        timestamp: new Date().toISOString(),
      });
    }

    if (result.escalation) {
      return res.json({
        response: result.aiResponse,
        sessionId,
        escalation: true,
        sentiment: result.sentiment,
        session: {
          isActive: true,
          timeRemainingSeconds: Math.ceil(result.sessionStatus.timeRemainingMs / 1000),
        },
        suggestions: result.suggestions,
        timestamp: new Date().toISOString(),
      });
    }

    const responsePayload = buildChatResponse({
      response: result.aiResponse,
      sessionId,
      sessionStatus: result.sessionStatus,
    });

    if (result.isNewSession && providedSessionId) {
      responsePayload.sessionRenewed = true;
    }

    return res.json(responsePayload);

  } catch (error) {
    console.error('❌ Chat handler error:', error);

    if (sessionId) {
      logAnalytics(sessionId, 'error_occurred', {
        error: error.message,
        timestamp: new Date().toISOString(),
      }).catch(() => {});
    }

    return res.status(500).json(buildErrorResponse(error, sessionId));
  }
}

async function getConversationHistory(req, res) {
  const { sessionId } = req.params;

  try {
    if (!sessionId) {
      return res.status(400).json({ error: 'missing_session_id', message: 'sessionId is required' });
    }

    let sessionStatus = checkSessionStatus(sessionId);

    if (sessionStatus.isExpired) {
      const recovered = await recoverSessionFromDB(sessionId);
      if (recovered) {
        sessionStatus = checkSessionStatus(sessionId);
      } else {
        return res.status(410).json({ error: 'session_expired', message: 'This conversation session has expired' });
      }
    }

    const conversation = await getConversationWithExpirationCheck(sessionId);

    return res.json({
      sessionId,
      messages: conversation.messages,
      isActive: sessionStatus.isActive,
      timeRemainingSeconds: Math.ceil(sessionStatus.timeRemainingMs / 1000),
      createdAt: conversation.createdAt,
      lastActivityAt: conversation.lastActivityAt,
    });

  } catch (error) {
    console.error('Error fetching conversation:', error);
    return res.status(500).json(buildErrorResponse(error, sessionId));
  }
}

async function keepAliveSession(req, res) {
  const { sessionId } = req.body;

  try {
    if (!sessionId) {
      return res.status(400).json({ error: 'missing_session_id', message: 'sessionId is required' });
    }

    let sessionStatus = checkSessionStatus(sessionId);

    if (sessionStatus.isExpired) {
      const recovered = await recoverSessionFromDB(sessionId);
      if (!recovered) {
        return res.status(410).json(buildSessionExpiredResponse(sessionId));
      }
      sessionStatus = checkSessionStatus(sessionId);
    }

    await updateSessionActivity(sessionId);
    const updatedStatus = checkSessionStatus(sessionId);

    return res.json({
      success: true,
      sessionId,
      message: 'Session keep-alive successful',
      timeRemainingSeconds: Math.ceil(updatedStatus.timeRemainingMs / 1000),
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Error in keep-alive:', error);
    return res.status(500).json({ error: 'keep_alive_failed', message: 'Failed to keep session alive' });
  }
}

/**
 * POST /api/chat/end-session
 *
 * Called when the user explicitly confirms they want to end the
 * conversation from the frontend (e.g. clicking the X and confirming
 * the "End this conversation?" dialog).
 */
async function endSession(req, res) {
  const { sessionId } = req.body;

  try {
    if (!sessionId) {
      return res.status(400).json({ error: 'missing_session_id', message: 'sessionId is required' });
    }

    await logAnalytics(sessionId, 'session_ended_by_user', {
      timestamp: new Date().toISOString(),
    }).catch(() => {});

    await deleteConversationData(sessionId);
    endSessionInMemory(sessionId);

    return res.json({
      success: true,
      sessionId,
      message: 'Session ended and cleaned up successfully',
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Error ending session:', error);
    return res.status(500).json({ error: 'end_session_failed', message: 'Failed to end session' });
  }
}

module.exports = { handleChat, getConversationHistory, keepAliveSession, endSession };
