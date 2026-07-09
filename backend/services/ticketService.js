const { pool } = require('../config/database');
const { computeTicketPriority } = require('./priorityService');

/**
 * Append-only audit log write. Every ticket mutation should go through
 * this so the ticket_events table stays a complete history, not just the
 * status/notes columns you'd overwrite.
 */
async function logTicketEvent(client, { ticketId, actorType, actorId = null, eventType, eventData = {} }) {
  await client.query(
    `INSERT INTO ticket_events (ticket_id, actor_type, actor_id, event_type, event_data)
     VALUES ($1, $2, $3, $4, $5)`,
    [ticketId, actorType, actorId, eventType, JSON.stringify(eventData)]
  );
}

/**
 * Creates a ticket from a chat escalation (or an explicit "talk to a
 * human" request). Called from chatEngine.js — never from the agent side.
 *
 * @param {Object} params
 * @param {string} params.sessionId
 * @param {'web'|'whatsapp'} params.channel
 * @param {string} params.triggerMessage - the message that caused escalation
 * @param {'angry'|'happy'|'neutral'} [params.sentiment]
 * @param {'auto_escalation'|'user_requested'} params.source
 * @param {string} [params.customerName]
 * @param {string} [params.customerPhone]
 * @param {string} [params.customerEmail]
 * @param {string} [params.category]
 */
async function createTicket({
  sessionId,
  channel,
  triggerMessage,
  sentiment = 'neutral',
  source,
  customerName = null,
  customerPhone = null,
  customerEmail = null,
  category = null,
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Repeat-contact signal feeds priority scoring — a session escalating
    // for the second+ time in one conversation deserves a bump.
    const priorHistory = await client.query(
      'SELECT COUNT(*)::int AS count FROM tickets WHERE session_id = $1',
      [sessionId]
    );
    const isRepeatEscalation = priorHistory.rows[0].count > 0;

    const { tier, score, signals, slaDueAt } = computeTicketPriority({
      message: triggerMessage,
      sentiment,
      category,
      isRepeatEscalation,
    });

    // Safety copy of the transcript so far — messages.session_id
    // cascade-deletes on session expiry/end-chat (see chatEngine.js), so
    // this survives that independent of ticket lifecycle.
    const transcriptResult = await client.query(
      `SELECT role, content, created_at FROM messages
       WHERE session_id = $1 ORDER BY created_at ASC`,
      [sessionId]
    );

    const subject = triggerMessage.length > 140
      ? `${triggerMessage.slice(0, 137)}...`
      : triggerMessage;

    const ticketResult = await client.query(
      `INSERT INTO tickets (
         session_id, channel, customer_name, customer_phone, customer_email,
         category, subject, priority, priority_score, source, sla_due_at,
         transcript_snapshot, metadata
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [
        sessionId, channel, customerName, customerPhone, customerEmail,
        category, subject, tier, score, source, slaDueAt,
        JSON.stringify(transcriptResult.rows),
        JSON.stringify({ sentiment, priority_signals: signals, trigger_message: triggerMessage }),
      ]
    );

    const ticket = ticketResult.rows[0];

    await logTicketEvent(client, {
      ticketId: ticket.id,
      actorType: 'system',
      eventType: 'created',
      eventData: { source, priority: tier, priority_score: score, signals },
    });

    await client.query('COMMIT');
    return ticket;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating ticket:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Paginated, filterable ticket queue for the staff dashboard.
 */
async function listTickets({
  status, priority, category, assignedTo, branchId,
  page = 1, pageSize = 25,
} = {}) {
  const conditions = [];
  const values = [];

  const addFilter = (column, value) => {
    if (value === undefined || value === null || value === '') return;
    values.push(value);
    conditions.push(`t.${column} = $${values.length}`);
  };

  addFilter('status', status);
  addFilter('priority', priority);
  addFilter('category', category);
  addFilter('assigned_to', assignedTo);
  addFilter('branch_id', branchId);

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (Math.max(1, page) - 1) * pageSize;

  values.push(pageSize, offset);

  const result = await pool.query(
    `SELECT t.*, a.full_name AS assigned_agent_name, b.name AS branch_name
     FROM tickets t
     LEFT JOIN agents a ON a.id = t.assigned_to
     LEFT JOIN branches b ON b.id = t.branch_id
     ${whereClause}
     ORDER BY
       CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
       t.sla_due_at ASC NULLS LAST,
       t.created_at DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS count FROM tickets t ${whereClause}`,
    values.slice(0, conditions.length)
  );

  return {
    tickets: result.rows,
    total: countResult.rows[0].count,
    page,
    pageSize,
  };
}

async function getTicketById(ticketId) {
  const result = await pool.query(
    `SELECT t.*, a.full_name AS assigned_agent_name, b.name AS branch_name
     FROM tickets t
     LEFT JOIN agents a ON a.id = t.assigned_to
     LEFT JOIN branches b ON b.id = t.branch_id
     WHERE t.id = $1`,
    [ticketId]
  );
  return result.rows[0] || null;
}

/**
 * Live transcript for a ticket's session. Falls back to the snapshot
 * captured at ticket-creation time if the live messages have since been
 * cleared (session expiry/end-chat cascade).
 */
async function getTicketMessages(ticketId) {
  const ticket = await getTicketById(ticketId);
  if (!ticket) return null;

  const liveResult = await pool.query(
    `SELECT role, content, created_at FROM messages
     WHERE session_id = $1 ORDER BY created_at ASC`,
    [ticket.session_id]
  );

  if (liveResult.rows.length > 0) {
    return { messages: liveResult.rows, source: 'live' };
  }
  return { messages: ticket.transcript_snapshot || [], source: 'snapshot' };
}

async function getTicketEvents(ticketId) {
  const result = await pool.query(
    `SELECT e.*, a.full_name AS actor_name
     FROM ticket_events e
     LEFT JOIN agents a ON a.id = e.actor_id
     WHERE e.ticket_id = $1
     ORDER BY e.created_at ASC`,
    [ticketId]
  );
  return result.rows;
}

async function updateTicketStatus(ticketId, status, actorAgentId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const resolvedClause = ['resolved', 'closed'].includes(status)
      ? ', resolved_at = COALESCE(resolved_at, NOW())'
      : '';

    const result = await client.query(
      `UPDATE tickets SET status = $1 ${resolvedClause} WHERE id = $2 RETURNING *`,
      [status, ticketId]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    await logTicketEvent(client, {
      ticketId, actorType: 'agent', actorId: actorAgentId,
      eventType: 'status_changed', eventData: { status },
    });

    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function updateTicketPriority(ticketId, priority, actorAgentId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE tickets SET priority = $1 WHERE id = $2 RETURNING *`,
      [priority, ticketId]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    await logTicketEvent(client, {
      ticketId, actorType: 'agent', actorId: actorAgentId,
      eventType: 'priority_changed', eventData: { priority, manual_override: true },
    });

    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function assignTicket(ticketId, agentId, actorAgentId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const status = 'assigned';
    const result = await client.query(
      `UPDATE tickets SET assigned_to = $1, status = $2 WHERE id = $3 RETURNING *`,
      [agentId, status, ticketId]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    await logTicketEvent(client, {
      ticketId, actorType: 'agent', actorId: actorAgentId,
      eventType: 'assigned', eventData: { assigned_to: agentId },
    });

    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function addTicketNote(ticketId, agentId, note) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await logTicketEvent(client, {
      ticketId, actorType: 'agent', actorId: agentId,
      eventType: 'note_added', eventData: { note },
    });
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Called by chatEngine.js on every inbound customer message, before the
 * bot pipeline runs. True means an agent has taken over this session's
 * open ticket and the bot should stay silent (the message still gets
 * logged by chatEngine so the agent sees it live).
 */
async function isSessionHandedOff(sessionId) {
  const result = await pool.query(
    `SELECT id FROM tickets
     WHERE session_id = $1 AND human_handled = true
       AND status NOT IN ('resolved', 'closed')
     LIMIT 1`,
    [sessionId]
  );
  return result.rows.length > 0;
}

/**
 * Agent replying to the customer from the ticket detail page. Stores the
 * message with role='agent' (requires the messages_role_check migration),
 * flips the ticket to human_handled, self-assigns if unassigned, and
 * advances status open->assigned->in_progress so the queue reflects it's
 * being worked. Delivery to the customer's actual channel (WhatsApp REST
 * send) is the controller's job — this just persists state.
 */
async function sendAgentMessage(ticketId, agentId, content) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const ticketResult = await client.query(
      'SELECT * FROM tickets WHERE id = $1 FOR UPDATE',
      [ticketId]
    );
    const ticket = ticketResult.rows[0];
    if (!ticket) {
      await client.query('ROLLBACK');
      return null;
    }

    // Guard against a rare edge case: the session's conversation row was
    // cleared (end-chat / expiry) after the ticket was created. messages
    // has an FK to conversations.session_id, so re-create it if missing
    // rather than letting the insert below fail.
    await client.query(
      `INSERT INTO conversations (session_id) VALUES ($1)
       ON CONFLICT (session_id) DO NOTHING`,
      [ticket.session_id]
    );

    const messageResult = await client.query(
      `INSERT INTO messages (session_id, role, content, metadata)
       VALUES ($1, 'agent', $2, $3) RETURNING *`,
      [ticket.session_id, content, JSON.stringify({ agentId, ticketId })]
    );

    const nextStatus =
      ['resolved', 'closed'].includes(ticket.status) ? ticket.status
      : ticket.status === 'open' ? 'assigned'
      : ticket.status === 'assigned' ? 'in_progress'
      : ticket.status;

    const updateResult = await client.query(
      `UPDATE tickets
       SET human_handled = true, status = $1, assigned_to = COALESCE(assigned_to, $2)
       WHERE id = $3 RETURNING *`,
      [nextStatus, agentId, ticketId]
    );

    await logTicketEvent(client, {
      ticketId, actorType: 'agent', actorId: agentId,
      eventType: 'message_sent', eventData: { preview: content.slice(0, 140) },
    });

    await client.query('COMMIT');
    return { message: messageResult.rows[0], ticket: updateResult.rows[0] };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Ticket counts for the signed-in agent's profile page. "Open" here means
 * actively in their queue (open/assigned/in_progress) as distinct from
 * pending_customer, so the three buckets don't overlap.
 */
async function getAgentStats(agentId) {
  const result = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE status IN ('open', 'assigned', 'in_progress'))::int AS open_count,
       COUNT(*) FILTER (WHERE status = 'pending_customer')::int AS pending_count,
       COUNT(*) FILTER (WHERE status IN ('resolved', 'closed'))::int AS closed_count,
       COUNT(*)::int AS total_count
     FROM tickets WHERE assigned_to = $1`,
    [agentId]
  );
  const row = result.rows[0];
  return {
    open: row.open_count,
    pending: row.pending_count,
    closed: row.closed_count,
    total: row.total_count,
  };
}

module.exports = {
  createTicket,
  listTickets,
  getTicketById,
  getTicketMessages,
  getTicketEvents,
  updateTicketStatus,
  updateTicketPriority,
  assignTicket,
  addTicketNote,
  isSessionHandedOff,
  sendAgentMessage,
  getAgentStats,
};
