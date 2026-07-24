const ticketService = require('../services/ticketService');
const { sendWhatsAppMessage } = require('../services/whatsappService');
const typingService = require('../services/typingService');

const VALID_STATUSES = ['open', 'assigned', 'in_progress', 'pending_customer', 'resolved', 'closed'];
const VALID_PRIORITIES = ['low', 'medium', 'high', 'urgent'];

async function listTickets(req, res, next) {
  try {
    const { status, priority, category, assignedTo, branchId, page, pageSize } = req.query;

    const result = await ticketService.listTickets({
      status,
      priority,
      category,
      assignedTo,
      branchId,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });

    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

async function getTicket(req, res, next) {
  try {
    const ticket = await ticketService.getTicketById(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Not Found', message: 'Ticket not found.' });
    return res.json({ ticket });
  } catch (error) {
    return next(error);
  }
}

async function getTicketMessages(req, res, next) {
  try {
    const result = await ticketService.getTicketMessages(req.params.id);
    if (!result) return res.status(404).json({ error: 'Not Found', message: 'Ticket not found.' });
    const { messages, source, sessionId } = result;

    // The agent is looking at this transcript right now (initial load or
    // the 5s poll) — mark any customer/user messages up to the latest one
    // as read so the widget can show a "Read" receipt. Fire-and-forget
    // isn't safe here (we want it committed before responding, but a
    // failure shouldn't break the transcript fetch itself), so it's
    // awaited but wrapped so it can't fail the request.
    const customerTimestamps = messages
      .filter((m) => m.role === 'user')
      .map((m) => m.created_at)
      .filter(Boolean);
    const latestCustomerMessageAt = customerTimestamps.length
      ? new Date(Math.max(...customerTimestamps.map((t) => new Date(t).getTime())))
      : null;
    if (latestCustomerMessageAt) {
      try {
        await ticketService.markMessagesRead(req.params.id, latestCustomerMessageAt);
      } catch (readError) {
        console.error('Failed to mark ticket messages as read:', readError);
      }
    }

    return res.json({
      messages,
      source,
      // Piggybacks on the existing 5s transcript poll rather than opening
      // a second poll loop just for typing state.
      customerTyping: sessionId ? typingService.isTyping(sessionId, 'customer') : false,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * PATCH /api/staff/tickets/:id/typing  Body: { isTyping }
 * Fire-and-forget signal from the agent's reply box so the customer widget
 * can show a live "agent is typing…" indicator.
 */
async function setTyping(req, res, next) {
  try {
    const { isTyping } = req.body;
    const ticket = await ticketService.getTicketById(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Not Found', message: 'Ticket not found.' });
    typingService.setTyping(ticket.session_id, 'agent', !!isTyping);
    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
}

async function getTicketEvents(req, res, next) {
  try {
    const events = await ticketService.getTicketEvents(req.params.id);
    return res.json({ events });
  } catch (error) {
    return next(error);
  }
}

async function updateStatus(req, res, next) {
  try {
    const { status } = req.body;
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Validation Error', message: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    }

    let ticket;
    try {
      ticket = await ticketService.updateTicketStatus(req.params.id, status, req.agent.sub);
    } catch (statusError) {
      if (statusError.code === 'TICKET_CLOSED') {
        return res.status(statusError.status || 409).json({ error: statusError.code, message: statusError.message });
      }
      throw statusError;
    }
    if (!ticket) return res.status(404).json({ error: 'Not Found', message: 'Ticket not found.' });

    // Notify the customer when their ticket reaches a terminal state.
    // The web widget already picks this up itself via its ticket-status
    // poll, but WhatsApp has no client-side polling — without a proactive
    // push here, a WhatsApp customer would never find out their ticket was
    // resolved/closed unless they happened to message again.
    if (['resolved', 'closed'].includes(status) && ticket.channel === 'whatsapp') {
      console.log(`📲 [TICKET CLOSE][WHATSAPP] ticketId=${ticket.id} ticket=${ticket.ticket_number || ticket.id} sessionId=${ticket.session_id} status=${status} — pushing closure notice via Twilio`);
      try {
        await sendWhatsAppMessage(
          ticket.session_id,
          `✅ Your ticket ${ticket.ticket_number ? `${ticket.ticket_number} ` : ''}has been marked as *${status}*. Thank you for chatting with CIC Insurance — message us anytime if you need more help!`
        );
        console.log(`📲 [TICKET CLOSE][WHATSAPP] ticketId=${ticket.id} closure notice delivered`);
      } catch (sendError) {
        console.error('❌ Failed to notify WhatsApp customer of ticket closure:', sendError.message);
      }
    }

    return res.json({ ticket });
  } catch (error) {
    return next(error);
  }
}

async function updatePriority(req, res, next) {
  try {
    const { priority } = req.body;
    if (!VALID_PRIORITIES.includes(priority)) {
      return res.status(400).json({ error: 'Validation Error', message: `priority must be one of: ${VALID_PRIORITIES.join(', ')}` });
    }
    const ticket = await ticketService.updateTicketPriority(req.params.id, priority, req.agent.sub);
    if (!ticket) return res.status(404).json({ error: 'Not Found', message: 'Ticket not found.' });
    return res.json({ ticket });
  } catch (error) {
    return next(error);
  }
}

async function assign(req, res, next) {
  try {
    const { agentId } = req.body;
    if (!agentId) {
      return res.status(400).json({ error: 'Validation Error', message: 'agentId is required.' });
    }
    const ticket = await ticketService.assignTicket(req.params.id, agentId, req.agent.sub);
    if (!ticket) return res.status(404).json({ error: 'Not Found', message: 'Ticket not found.' });

    if (ticket.channel === 'whatsapp') {
      try {
        // assignTicket's plain UPDATE...RETURNING doesn't carry the
        // agent's name, so look the ticket back up joined with agents.
        const withAgent = await ticketService.getTicketById(ticket.id);
        const agentName = withAgent?.assigned_agent_name || 'One of our agents';
        await sendWhatsAppMessage(
          ticket.session_id,
          `🎯 ${agentName} has been assigned to ticket ${ticket.ticket_number ? `#${ticket.ticket_number} ` : ''}and will be helping you now.`
        );
      } catch (sendError) {
        console.error('❌ Failed to notify WhatsApp customer of ticket assignment:', sendError.message);
      }
    }

    return res.json({ ticket });
  } catch (error) {
    return next(error);
  }
}

/**
 * PATCH /api/staff/tickets/:id/accept
 * Self-service accept: any signed-in agent viewing an unaccepted ticket can
 * take it. Moves the ticket to in_progress and self-assigns. Must happen
 * before the agent is allowed to send a message (see sendMessage below and
 * ticketService.sendAgentMessage's guard).
 */
async function accept(req, res, next) {
  try {
    const ticket = await ticketService.acceptTicket(req.params.id, req.agent.sub);
    if (!ticket) return res.status(404).json({ error: 'Not Found', message: 'Ticket not found.' });

    // WhatsApp customers have no widget UI showing "X has joined" the way
    // the web chat does — without this push they never learn who (or
    // whether anyone) picked up their ticket.
    if (ticket.channel === 'whatsapp') {
      try {
        const agentName = req.agent.fullName || 'One of our agents';
        await sendWhatsAppMessage(
          ticket.session_id,
          `Your chat has been transferred to  ${agentName} ${ticket.ticket_number ? `${ticket.ticket_number} ` : ''}.`
        );
      } catch (sendError) {
        console.error('❌ Failed to notify WhatsApp customer of ticket acceptance:', sendError.message);
      }
    }

    return res.json({ ticket });
  } catch (error) {
    if (error.code === 'ALREADY_ASSIGNED' || error.code === 'TICKET_CLOSED') {
      return res.status(error.status || 409).json({ error: error.code, message: error.message });
    }
    return next(error);
  }
}

async function addNote(req, res, next) {
  try {
    const { note } = req.body;
    if (!note || !note.trim()) {
      return res.status(400).json({ error: 'Validation Error', message: 'note is required.' });
    }
    await ticketService.addTicketNote(req.params.id, req.agent.sub, note.trim());
    return res.status(201).json({ success: true });
  } catch (error) {
    return next(error);
  }
}

/**
 * POST /api/staff/tickets/:id/messages  Body: { content }
 * Agent replying directly to the customer. Persists the message (via
 * ticketService, role='agent') and, for WhatsApp tickets, pushes it out
 * over the Twilio REST API immediately. Web-channel customers pick it up
 * via their widget's poll of GET /api/chat/conversation/:sessionId — no
 * push needed there since that connection is already client-initiated.
 */
async function sendMessage(req, res, next) {
  try {
    const { content, replyToMessageId } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Validation Error', message: 'content is required.' });
    }

    let result;
    try {
      result = await ticketService.sendAgentMessage(req.params.id, req.agent.sub, content.trim(), replyToMessageId || null);
    } catch (sendError) {
      if (['TICKET_CLOSED', 'NOT_ACCEPTED', 'ASSIGNED_TO_OTHER'].includes(sendError.code)) {
        return res.status(sendError.status || 409).json({ error: sendError.code, message: sendError.message });
      }
      throw sendError;
    }
    if (!result) return res.status(404).json({ error: 'Not Found', message: 'Ticket not found.' });

    const replySnippet = result.message.metadata?.replyTo;
    if (replySnippet) {
      console.log(`↩️ [TICKET REPLY] ticketId=${req.params.id} agent replied to messageId=${replySnippet.id} (role=${replySnippet.role})`);
    }

    if (result.ticket.channel === 'whatsapp') {
      // Twilio's REST send API (services/whatsappService.js) has no native
      // "quote this message" support for outbound sends — that's only
      // available via WhatsApp's own client UI for messages sent through
      // it, not for arbitrary messages pushed via the API. As a practical
      // stand-in so the customer still sees what's being replied to, quote
      // the original snippet as plain text ahead of the agent's reply.
      const outgoing = replySnippet
        ? `↩️ _Replying to: "${replySnippet.content}"_\n\n${content.trim()}`
        : content.trim();
      try {
        await sendWhatsAppMessage(result.ticket.session_id, outgoing);
      } catch (sendError) {
        // The message is already saved and visible in the transcript —
        // don't roll that back over a delivery failure, just surface it
        // so the agent knows to follow up another way.
        console.error('❌ Failed to deliver agent WhatsApp reply:', sendError.message);
        return res.status(201).json({
          message: result.message,
          ticket: result.ticket,
          deliveryWarning: 'Message saved but WhatsApp delivery failed. The customer may not have received it.',
        });
      }
    }

    return res.status(201).json({ message: result.message, ticket: result.ticket });
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /api/staff/tickets/stats/me
 * Ticket counts for the signed-in agent's profile page.
 */
async function getMyStats(req, res, next) {
  try {
    const stats = await ticketService.getAgentStats(req.agent.sub);
    return res.json({ stats });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listTickets,
  getTicket,
  getTicketMessages,
  getTicketEvents,
  updateStatus,
  updatePriority,
  assign,
  accept,
  addNote,
  sendMessage,
  getMyStats,
  setTyping,
};