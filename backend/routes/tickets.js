const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');
const { requireRole } = require('../middleware/agentAuth');

// Mounted in server.js as: app.use('/api/staff/tickets', requireAgent, ticketsRouter)
// so every route below already has req.agent set.

/**
 * GET /api/staff/tickets
 * Query: status, priority, category, assignedTo, branchId, page, pageSize
 * Sorted by priority tier then SLA due date — the queue view.
 */
router.get('/', ticketController.listTickets);

/**
 * GET /api/staff/tickets/stats/me — signed-in agent's open/pending/closed
 * counts for the profile page. Must be registered before GET /:id so
 * Express doesn't treat "stats" as a ticket id.
 */
router.get('/stats/me', ticketController.getMyStats);

/** GET /api/staff/tickets/:id */
router.get('/:id', ticketController.getTicket);

/** GET /api/staff/tickets/:id/messages — live transcript (or snapshot fallback) */
router.get('/:id/messages', ticketController.getTicketMessages);

/** POST /api/staff/tickets/:id/messages  Body: { content } — agent replies to the customer */
router.post('/:id/messages', ticketController.sendMessage);

/** GET /api/staff/tickets/:id/events — audit trail */
router.get('/:id/events', ticketController.getTicketEvents);

/** PATCH /api/staff/tickets/:id/status  Body: { status } */
router.patch('/:id/status', ticketController.updateStatus);

/** PATCH /api/staff/tickets/:id/priority  Body: { priority } */
router.patch('/:id/priority', ticketController.updatePriority);

/**
 * PATCH /api/staff/tickets/:id/assign  Body: { agentId }
 * Restricted to supervisor/admin — line agents shouldn't reassign each
 * other's queues; they can still pick up unassigned tickets via this
 * same endpoint passing their own id if you want self-assign allowed —
 * loosen this to requireAgent only if that's the desired workflow.
 */
router.patch('/:id/assign', requireRole('supervisor', 'admin'), ticketController.assign);

/** POST /api/staff/tickets/:id/notes  Body: { note } */
router.post('/:id/notes', ticketController.addNote);

module.exports = router;
