const express = require('express');
const router = express.Router();
const { handleChat } = require('../controllers/chatController');
const { validateInput } = require('../middleware/validateInput');

/**
 * POST /api/chat
 * Main chat endpoint
 * Body: { message: string, sessionId?: string }
 */
router.post('/', validateInput, handleChat);

/**
 * GET /api/chat/health
 * Health check for chat service
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Chat API',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;