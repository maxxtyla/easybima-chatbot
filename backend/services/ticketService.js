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
    console.log(`📋 [TICKET] Starting ticket creation for session: ${sessionId}`);
    await client.query('BEGIN');

    // Repeat-contact signal feeds priority scoring — a session escalating
    // for the second+ time in one conversation deserves a bump.
    const priorHistory = await client.query(
      'SELECT COUNT(*)::int AS count FROM tickets WHERE session_id = $1',
      [sessionId]
    );
    const isRepeatEscalation = priorHistory.rows[0].count > 0;
    console.log(`📋 [TICKET] Is repeat escalation: ${isRepeatEscalation}`);

    const { tier, score, signals, slaDueAt } = computeTicketPriority({
      message: triggerMessage,
      sentiment,
      category,
      isRepeatEscalation,
    });
    console.log(`📋 [TICKET] Priority computed: tier=${tier}, score=${score}`);

    // Safety copy of the transcript so far — messages.session_id
    // cascade-deletes on session expiry/end-chat (see chatEngine.js), so
    // this survives that independent of ticket lifecycle.
    const transcriptResult = await client.query(
      `SELECT role, content, created_at FROM messages
       WHERE session_id = $1 ORDER BY created_at ASC`,
      [sessionId]
    );
    console.log(`📋 [TICKET] Transcript snapshot: ${transcriptResult.rows.length} messages`);

    const subject = triggerMessage.length > 140
      ? `${triggerMessage.slice(0, 137)}...`
      : triggerMessage;

    console.log(`📋 [TICKET] Inserting ticket record...`);
    // ticket_number is generated here explicitly (not left to the
    // set_tickets_ticket_number DB trigger alone) — see
    // database/migrations/2026_07_10_fix_ticket_number_generation.sql for
    // why: the trigger was found to be missing on the live DB, which meant
    // every ticket was silently inserted with ticket_number = NULL. Calling
    // nextval() directly here means a ticket always gets a real reference
    // number even in an environment where that trigger hasn't been applied.
    const ticketResult = await client.query(
      `INSERT INTO tickets (
           ticket_number, session_id, channel, customer_name, customer_phone, customer_email,
           category, subject, priority, priority_score, source, sla_due_at,
           transcript_snapshot, metadata
        ) VALUES ('TCK-' || LPAD(nextval('public.ticket_number_seq')::text, 6, '0'), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *`,
      [
        sessionId,         // $1
        channel,           // $2
        customerName,      // $3
        customerPhone,     // $4
        customerEmail,     // $5
        category,          // $6
        subject,           // $7
        tier,              // $8
        score,             // $9
        source,            // $10
        slaDueAt,          // $11
        JSON.stringify(transcriptResult.rows), // $12
        JSON.stringify({ sentiment, priority_signals: signals, trigger_message: triggerMessage }), // $13
      ]
    );
    const ticket = ticketResult.rows[0];
    console.log(`📋 [TICKET] Ticket record inserted: id=${ticket.id}, ticket_number=${ticket.ticket_number}`);

    await logTicketEvent(client, {
      ticketId: ticket.id,
      actorType: 'system',
      eventType: 'created',
      eventData: { source, priority: tier, priority_score: score, signals },
    });

    await client.query('COMMIT');
    console.log(`✅ [TICKET] Created successfully: ${ticket.ticket_number}`);
    return ticket;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ [TICKET] Error creating ticket:');
    console.error('   Message:', error.message);
    console.error('   Code:', error.code);
    console.error('   Detail:', error.detail);
    console.error('   Stack:', error.stack);
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

    // Terminal states are permanent, per the requested UX: once a ticket is
    // resolved/closed (by either the agent or the customer), it can never
    // be moved back to any other status. Lock the row first so a
    // concurrent close and status-change can't race each other into a
    // reopened ticket.
    const existingResult = await client.query('SELECT status FROM tickets WHERE id = $1 FOR UPDATE', [ticketId]);
    const existing = existingResult.rows[0];
    if (!existing) {
      await client.query('ROLLBACK');
      return null;
    }
    if (['resolved', 'closed'].includes(existing.status)) {
      await client.query('ROLLBACK');
      const err = new Error('This ticket is already resolved or closed and cannot be reopened.');
      err.code = 'TICKET_CLOSED';
      err.status = 409;
      throw err;
    }

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

/**
 * Agent explicitly accepting a ticket from the ticket detail page, before
 * they're allowed to type anything to the customer. Distinct from
 * assignTicket (which is a supervisor/admin reassignment action): this is
 * self-service — any agent viewing an unaccepted ticket can accept it for
 * themselves. Moves status straight to 'in_progress' (skipping 'assigned')
 * since the agent is about to start actively working it, not just have it
 * sitting assigned-but-untouched.
 *
 * Throws a tagged error (.code + .status) rather than a generic one so the
 * controller can surface a specific, user-facing message instead of the
 * generic "Something went wrong" the global error handler falls back to.
 */
async function acceptTicket(ticketId, agentId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const ticketResult = await client.query('SELECT * FROM tickets WHERE id = $1 FOR UPDATE', [ticketId]);
    const ticket = ticketResult.rows[0];
    if (!ticket) {
      await client.query('ROLLBACK');
      return null;
    }

    if (['resolved', 'closed'].includes(ticket.status)) {
      await client.query('ROLLBACK');
      const err = new Error('This ticket is already closed and can no longer be accepted.');
      err.code = 'TICKET_CLOSED';
      err.status = 409;
      throw err;
    }

    if (ticket.assigned_to && ticket.assigned_to !== agentId) {
      await client.query('ROLLBACK');
      const err = new Error('This ticket has already been accepted by another agent.');
      err.code = 'ALREADY_ASSIGNED';
      err.status = 409;
      throw err;
    }

    // Already accepted by this same agent (e.g. a duplicate click) — treat
    // as a no-op success rather than an error.
    if (ticket.assigned_to === agentId && ticket.status !== 'open') {
      await client.query('ROLLBACK');
      return ticket;
    }

    const result = await client.query(
      `UPDATE tickets SET assigned_to = $1, status = 'in_progress' WHERE id = $2 RETURNING *`,
      [agentId, ticketId]
    );

    await logTicketEvent(client, {
      ticketId, actorType: 'agent', actorId: agentId,
      eventType: 'accepted', eventData: {},
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
 * BUG FIX: previously chatEngine.js only went silent once human_handled
 * flipped to true (i.e. once an agent had actually sent a reply). Between
 * "ticket created" and "agent picks it up", any follow-up message from the
 * customer (e.g. "ok waiting", "hello?") fell through to the normal
 * RAG/AI pipeline and got a fresh, unrelated bot reply — including its own
 * "anything else I can help with?" style closing — right after they'd
 * just been told a ticket was created for them. That's confusing and is
 * part of what looked like a broken escalation flow.
 *
 * This checks for ANY open (not resolved/closed) ticket on the session,
 * regardless of human_handled, so the bot goes quiet as soon as a ticket
 * exists and simply waits for a real agent, rather than talking over it.
 */
async function hasOpenTicket(sessionId) {
  const result = await pool.query(
    `SELECT id FROM tickets
     WHERE session_id = $1 AND status NOT IN ('resolved', 'closed')
     LIMIT 1`,
    [sessionId]
  );
  return result.rows.length > 0;
}

/**
 * Get the current active (open, not resolved/closed) ticket for a
 * session, including agent details if one has been assigned yet.
 * Returns null if no active ticket exists. Used both right after ticket
 * creation (agent details will be null/unassigned) and once an agent has
 * picked it up.
 */
async function getActiveTicketWithAgent(sessionId) {
  const result = await pool.query(
    `SELECT t.*, a.full_name AS assigned_agent_name
     FROM tickets t
     LEFT JOIN agents a ON a.id = t.assigned_to
     WHERE t.session_id = $1 
       AND t.status NOT IN ('resolved', 'closed')
     LIMIT 1`,
    [sessionId]
  );
  return result.rows[0] || null;
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

    if (['resolved', 'closed'].includes(ticket.status)) {
      await client.query('ROLLBACK');
      const err = new Error('This ticket is closed. Reopen it before messaging the customer.');
      err.code = 'TICKET_CLOSED';
      err.status = 409;
      throw err;
    }

    // Enforce "accept before you type": an agent can't message the
    // customer until they've accepted the ticket (which self-assigns it
    // and moves it to in_progress — see acceptTicket above). Without this,
    // sendAgentMessage's old behaviour of auto-assigning on first message
    // let an agent start typing before ever confirming they'd take the
    // ticket, and let two agents collide on the same unaccepted ticket.
    if (!ticket.assigned_to) {
      await client.query('ROLLBACK');
      const err = new Error('Accept this ticket before sending a message to the customer.');
      err.code = 'NOT_ACCEPTED';
      err.status = 409;
      throw err;
    }
    if (ticket.assigned_to !== agentId) {
      await client.query('ROLLBACK');
      const err = new Error('This ticket is assigned to another agent.');
      err.code = 'ASSIGNED_TO_OTHER';
      err.status = 403;
      throw err;
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
 * Customer-initiated close from the chat widget ("Close ticket" button on
 * the ticket card). Unlike updateTicketStatus (agent-only, takes any
 * status), this only ever closes — permanently, per the requested UX — and
 * is scoped by sessionId rather than a bare ticketId so a customer can only
 * ever close their own session's ticket, not an arbitrary one by guessing
 * an id. Returns null if there's no active ticket on this session (nothing
 * to close, e.g. already closed).
 */
async function closeTicketByCustomer(sessionId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const ticketResult = await client.query(
      `SELECT * FROM tickets
       WHERE session_id = $1 AND status NOT IN ('resolved', 'closed')
       ORDER BY created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [sessionId]
    );
    const ticket = ticketResult.rows[0];
    if (!ticket) {
      await client.query('ROLLBACK');
      return null;
    }

    const result = await client.query(
      `UPDATE tickets SET status = 'closed', resolved_at = COALESCE(resolved_at, NOW()) WHERE id = $1 RETURNING *`,
      [ticket.id]
    );

    await logTicketEvent(client, {
      ticketId: ticket.id, actorType: 'customer', eventType: 'closed_by_customer', eventData: {},
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
  acceptTicket,
  addTicketNote,
  isSessionHandedOff,
  hasOpenTicket,
  getActiveTicketWithAgent,
  sendAgentMessage,
  closeTicketByCustomer,
  getAgentStats,
};
