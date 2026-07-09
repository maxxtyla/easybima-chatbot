const ticketService = require('../services/ticketService');
const { sendWhatsAppMessage } = require('../services/whatsappService');

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
    return res.json(result);
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
    const ticket = await ticketService.updateTicketStatus(req.params.id, status, req.agent.sub);
    if (!ticket) return res.status(404).json({ error: 'Not Found', message: 'Ticket not found.' });
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
    return res.json({ ticket });
  } catch (error) {
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
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Validation Error', message: 'content is required.' });
    }

    const result = await ticketService.sendAgentMessage(req.params.id, req.agent.sub, content.trim());
    if (!result) return res.status(404).json({ error: 'Not Found', message: 'Ticket not found.' });

    if (result.ticket.channel === 'whatsapp') {
      try {
        await sendWhatsAppMessage(result.ticket.session_id, content.trim());
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
  addNote,
  sendMessage,
  getMyStats,
};
