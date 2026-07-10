const chatEngine = require('../services/chatEngine');
const {
  checkSessionStatus,
  recoverSessionFromDB,
  getConversationWithExpirationCheck,
  updateSessionActivity,
  endSessionInMemory,
} = require('../services/sessionManager');
const { logAnalytics, deleteConversationData, logMessage } = require('../services/conversationService');
const {
  buildChatResponse,
  buildSessionExpiredResponse,
  buildErrorResponse,
} = require('../utils/responseBuilder');
const { getActiveTicketWithAgent, closeTicketByCustomer } = require('../services/ticketService');

/**
 * POST /api/chat
 * Thin HTTP adapter around chatEngine.processMessage — all RAG/Claude/
 * session logic lives in services/chatEngine.js so it stays identical
 * across the web widget and WhatsApp.
 */
async function handleChat(req, res) {
  const { message, sessionId: providedSessionId } = req.body;
  let sessionId = providedSessionId;

  console.log(`📨 [CHAT] Incoming message - sessionId: ${providedSessionId}, msg length: ${message?.length}`);

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
      console.log(`✅ [CHAT] HUMAN HANDLED - ticketNumber: ${result.ticketNumber}, agent: ${result.assignedAgent?.name}`);
      // Agent has taken this session over — message is already logged for
      // them to see; no bot reply to send. The widget should stop showing
      // a typing indicator and start polling for the agent's reply.
      return res.json({
        response: null,
        sessionId,
        humanHandled: true,
        ticketNumber: result.ticketNumber || null,
        ticketStatus: result.ticketStatus || 'open',
        ticketCreatedAt: result.ticketCreatedAt || null,
        assignedAgent: result.assignedAgent || null,
        session: {
          isActive: true,
          timeRemainingSeconds: Math.ceil(result.sessionStatus.timeRemainingMs / 1000),
        },
        timestamp: new Date().toISOString(),
      });
    }

    if (result.escalation) {
      console.log(`🚨 [CHAT] ESCALATION - ticketNumber: ${result.ticketNumber}`);
      return res.json({
        response: result.aiResponse,
        sessionId,
        escalation: true,
        sentiment: result.sentiment,
        ticketNumber: result.ticketNumber || null,
        ticketStatus: result.ticketStatus || 'open',
        ticketCreatedAt: result.ticketCreatedAt || null,
        assignedAgent: result.assignedAgent || null,
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

/**
 * GET /api/chat/ticket/:sessionId
 *
 * Lightweight polling endpoint so the widget can pick up ticket state
 * changes (an agent accepting the ticket, an agent closing/resolving it,
 * etc.) that happen on the staff side without the customer needing to send
 * a new message first. The main POST /api/chat response already carries
 * this info as a side effect of a chat turn — this lets the frontend refresh
 * it independently, e.g. every few seconds while a ticket is open.
 */
async function getTicketStatus(req, res) {
  const { sessionId } = req.params;
  try {
    if (!sessionId) {
      return res.status(400).json({ error: 'missing_session_id', message: 'sessionId is required' });
    }

    const ticket = await getActiveTicketWithAgent(sessionId);

    return res.json({
      hasActiveTicket: !!ticket,
      ticketNumber: ticket?.ticket_number || null,
      ticketStatus: ticket?.status || null,
      ticketCreatedAt: ticket?.created_at ? new Date(ticket.created_at).toISOString() : null,
      assignedAgent: ticket && ticket.assigned_to
        ? { id: ticket.assigned_to, name: ticket.assigned_agent_name }
        : null,
    });
  } catch (error) {
    console.error('Error fetching ticket status:', error);
    return res.status(500).json(buildErrorResponse(error, sessionId));
  }
}

/**
 * POST /api/chat/ticket/close  Body: { sessionId }
 *
 * Customer-initiated close from the "Close ticket" button on the widget's
 * ticket card. Scoped by sessionId (not a raw ticket id) so a customer can
 * only ever close their own session's ticket. Permanent — matches the
 * requested UX of the customer being able to close it themselves and have
 * it stay closed.
 */
async function closeTicket(req, res) {
  const { sessionId } = req.body;
  try {
    if (!sessionId) {
      return res.status(400).json({ error: 'missing_session_id', message: 'sessionId is required' });
    }

    const ticket = await closeTicketByCustomer(sessionId);
    if (!ticket) {
      return res.status(404).json({ error: 'not_found', message: 'No open ticket found for this session.' });
    }

    // Best-effort transcript note — non-fatal if it fails, the ticket is
    // already closed either way.
    await logMessage(sessionId, 'system', 'Customer closed the ticket.', {
      ticketId: ticket.id,
    }).catch(() => {});

    await logAnalytics(sessionId, 'ticket_closed_by_customer', {
      ticketId: ticket.id,
      ticketNumber: ticket.ticket_number,
      timestamp: new Date().toISOString(),
    }).catch(() => {});

    return res.json({
      success: true,
      ticketNumber: ticket.ticket_number,
      ticketStatus: ticket.status,
    });
  } catch (error) {
    console.error('Error closing ticket:', error);
    return res.status(500).json(buildErrorResponse(error, sessionId));
  }
}

module.exports = { handleChat, getConversationHistory, keepAliveSession, endSession, getTicketStatus, closeTicket };
