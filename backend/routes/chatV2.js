const express = require('express');
const router = express.Router();
const { handleChat, getConversationHistory, keepAliveSession, endSession } = require('../controllers/chatControllerV2');
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
