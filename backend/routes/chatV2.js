const express = require('express');
const router = express.Router();
const { handleChat, getConversationHistory, keepAliveSession, endSession, getTicketStatus, closeTicket, submitContactInfo } = require('../controllers/chatControllerV2');
const { validateInput } = require('../middleware/validateInput');

/**
 * POST /api/chat
 * Main chat endpoint with session management
 * 
 * Request body:
 * {
 *   message: string (required),
 *   sessionId: string (optional - generates new if not provided)
 * }
 * 
 * Response:
 * {
 *   response: string,
 *   sessionId: string,
 *   timestamp: ISO string,
 *   session: {
 *     isActive: boolean,
 *     timeRemainingSeconds: number
 *   },
 *   warning?: {
 *     type: 'session_expiring_soon',
 *     message: string,
 *     timeRemainingSeconds: number,
 *     action: string
 *   }
 * }
 */
router.post('/', validateInput, handleChat);

/**
 * GET /api/chat/conversation/:sessionId
 * Retrieve conversation history
 * Respects session expiration
 */
router.get('/conversation/:sessionId', getConversationHistory);

/**
 * POST /api/chat/keep-alive
 * Reset inactivity timer without sending a message
 * Useful for frontend to prevent expiration during user think time
 * 
 * Request body:
 * {
 *   sessionId: string
 * }
 * 
 * Response:
 * {
 *   success: boolean,
 *   sessionId: string,
 *   timeRemainingSeconds: number,
 *   timestamp: ISO string
 * }
 */
router.post('/keep-alive', keepAliveSession);

/**
 * POST /api/chat/end-session
 * Explicitly end & clean up a conversation when the user confirms
 * closing the chat widget (as opposed to letting it idle-time-out).
 * Deletes the stored message history for the session and drops it from
 * the in-memory session index so the next open starts fresh.
 *
 * Request body:
 * {
 *   sessionId: string
 * }
 *
 * Response:
 * {
 *   success: boolean,
 *   sessionId: string,
 *   message: string,
 *   timestamp: ISO string
 * }
 */
router.post('/end-session', endSession);

/**
 * GET /api/chat/ticket/:sessionId
 * Poll for ticket state (agent accepted / status changed) without needing
 * to send a chat message first. See chatControllerV2.getTicketStatus.
 */
router.get('/ticket/:sessionId', getTicketStatus);

/**
 * POST /api/chat/ticket/close  Body: { sessionId }
 * Customer closes their own open ticket from the widget's ticket card.
 */
router.post('/ticket/close', closeTicket);

/**
 * POST /api/chat/contact-info
 * Body: { sessionId, name?, email?, phone? }
 *
 * Attaches customer contact details to the session's current open ticket.
 * Called from the widget's "How can we reach you?" prompt shown right
 * after a live-support escalation. At least one of email/phone is required.
 *
 * Response:
 * {
 *   success: boolean,
 *   ticketNumber: string,
 *   customerName: string | null,
 *   customerEmail: string | null,
 *   customerPhone: string | null
 * }
 */
router.post('/contact-info', submitContactInfo);

/**
 * GET /api/chat/health
 * Health check for chat service
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Chat API with Session Management',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
