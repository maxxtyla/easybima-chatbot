const express = require('express');
const router = express.Router();
const { handleChat, getConversationHistory, keepAliveSession } = require('../controllers/chatControllerV2');
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
