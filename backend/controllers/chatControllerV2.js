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
const { getLatestTicketWithAgent, closeTicketByCustomer, submitCustomerContactInfo } = require('../services/ticketService');
const typingService = require('../services/typingService');
const validator = require('validator');

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

    console.log(`🧹 [SESSION CLEANUP] Chat closed from frontend — sessionId=${sessionId}, starting cleanup`);

    await logAnalytics(sessionId, 'session_ended_by_user', {
      timestamp: new Date().toISOString(),
    }).catch(() => {});

    await deleteConversationData(sessionId);
    console.log(`🧹 [SESSION CLEANUP] Conversation data deleted — sessionId=${sessionId}`);

    endSessionInMemory(sessionId);
    console.log(`🧹 [SESSION CLEANUP] In-memory session cleared — sessionId=${sessionId}`);

    return res.json({
      success: true,
      sessionId,
      message: 'Session ended and cleaned up successfully',
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error(`🧹 [SESSION CLEANUP] Error ending session for sessionId=${sessionId}:`, error);
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

    // BUG FIX: this used to call getActiveTicketWithAgent, which filters
    // out resolved/closed tickets. That meant the moment an agent closed a
    // ticket from the staff dashboard, this endpoint started reporting
    // "no ticket" instead of "closed" — so the widget's poll loop never
    // saw the terminal status and the customer was never told their
    // ticket had been closed. getLatestTicketWithAgent returns the ticket
    // regardless of status so that transition is visible here.
    const ticket = await getLatestTicketWithAgent(sessionId);
    const isTerminal = ticket && ['resolved', 'closed'].includes(ticket.status);

    if (isTerminal) {
      console.log(`🔒 [TICKET STATUS] sessionId=${sessionId} ticket=${ticket.ticket_number || ticket.id} status=${ticket.status} — reporting terminal status to widget poll`);
    }

    return res.json({
      hasActiveTicket: !!ticket && !isTerminal,
      ticketNumber: ticket?.ticket_number || null,
      ticketStatus: ticket?.status || null,
      ticketCreatedAt: ticket?.created_at ? new Date(ticket.created_at).toISOString() : null,
      assignedAgent: ticket && ticket.assigned_to
        ? { id: ticket.assigned_to, name: ticket.assigned_agent_name }
        : null,
      // Piggybacks on the existing 4s poll rather than opening a second
      // poll loop just for typing state.
      agentTyping: isTerminal ? false : typingService.isTyping(sessionId, 'agent'),
      // Timestamp up to which the assigned agent has viewed the customer's
      // messages (see ticketService.markMessagesRead) — the widget compares
      // this against each of its own message timestamps to show a "Read"
      // receipt, the same way agentTyping drives the typing indicator.
      agentReadAt: ticket?.customer_messages_read_at
        ? new Date(ticket.customer_messages_read_at).toISOString()
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
      console.log(`🔒 [TICKET CLOSE][WEB] sessionId=${sessionId} no open ticket to close`);
      return res.status(404).json({ error: 'not_found', message: 'No open ticket found for this session.' });
    }

    console.log(`🔒 [TICKET CLOSE][WEB] sessionId=${sessionId} ticket=${ticket.ticket_number || ticket.id} closed by customer via widget`);

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

/**
 * POST /api/chat/contact-info  Body: { sessionId, name?, email?, phone? }
 *
 * Called from the widget's "How can we reach you?" prompt, shown right
 * after a live-support escalation creates a ticket. Attaches whatever
 * contact details the customer gives to their current open ticket, so the
 * agent picking it up can see (and reach) the person they're helping
 * instead of just an anonymous session id. At least one of email/phone is
 * required; both are accepted so the customer only has to fill in what
 * they're comfortable sharing.
 */
async function submitContactInfo(req, res) {
  const { sessionId, name, email, phone } = req.body;

  try {
    if (!sessionId) {
      return res.status(400).json({ error: 'missing_session_id', message: 'sessionId is required' });
    }

    const trimmedEmail = typeof email === 'string' ? email.trim() : '';
    const trimmedPhone = typeof phone === 'string' ? phone.trim() : '';
    const trimmedName = typeof name === 'string' ? name.trim() : '';

    if (!trimmedEmail && !trimmedPhone) {
      return res.status(400).json({
        error: 'contact_info_required',
        message: 'Please provide at least an email address or a phone number.',
      });
    }

    if (trimmedEmail && !validator.isEmail(trimmedEmail)) {
      return res.status(400).json({ error: 'invalid_email', message: 'That email address doesn\'t look right.' });
    }

    // Loose check — customers type numbers in every format under the sun
    // (spaces, dashes, +254...). We just want to catch obvious junk, not
    // enforce a specific national format.
    if (trimmedPhone && !/^\+?[0-9\s\-()]{7,20}$/.test(trimmedPhone)) {
      return res.status(400).json({ error: 'invalid_phone', message: 'That phone number doesn\'t look right.' });
    }

    const ticket = await submitCustomerContactInfo({
      sessionId,
      customerName: trimmedName || null,
      customerEmail: trimmedEmail || null,
      customerPhone: trimmedPhone || null,
    });

    if (!ticket) {
      return res.status(404).json({
        error: 'not_found',
        message: 'No open support ticket found for this session.',
      });
    }

    await logAnalytics(sessionId, 'contact_info_submitted', {
      ticketId: ticket.id,
      ticketNumber: ticket.ticket_number,
      hasEmail: !!trimmedEmail,
      hasPhone: !!trimmedPhone,
      timestamp: new Date().toISOString(),
    }).catch(() => {});

    return res.json({
      success: true,
      ticketNumber: ticket.ticket_number,
      customerName: ticket.customer_name,
      customerEmail: ticket.customer_email,
      customerPhone: ticket.customer_phone,
    });
  } catch (error) {
    console.error('Error submitting contact info:', error);
    return res.status(500).json(buildErrorResponse(error, sessionId));
  }
}

/**
 * POST /api/chat/typing  Body: { sessionId, isTyping }
 *
 * Fire-and-forget signal from the customer widget so a staff agent viewing
 * the ticket sees a live "customer is typing…" indicator. Intentionally
 * has no session-expiry checks — it's harmless to record typing state for
 * a session that's about to expire, and adding those checks here would
 * just slow down what's meant to be a cheap, frequent call.
 */
async function setTypingStatus(req, res) {
  const { sessionId, isTyping } = req.body;
  try {
    if (!sessionId) {
      return res.status(400).json({ error: 'missing_session_id', message: 'sessionId is required' });
    }
    typingService.setTyping(sessionId, 'customer', !!isTyping);
    return res.json({ success: true });
  } catch (error) {
    console.error('Error setting typing status:', error);
    return res.status(500).json(buildErrorResponse(error, sessionId));
  }
}

module.exports = { handleChat, getConversationHistory, keepAliveSession, endSession, getTicketStatus, closeTicket, submitContactInfo, setTypingStatus };