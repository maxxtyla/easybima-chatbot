const express = require('express');
const router = express.Router();
const { handleLogin, handleLogout, handleMe } = require('../controllers/agentAuthController');
const { requireAgent } = require('../middleware/agentAuth');
const { strictRateLimiter } = require('../middleware/rateLimiter');

/**
 * POST /api/staff/auth/login
 * Body: { email, password }
 * Sets an httpOnly staff_token cookie on success.
 */
router.post('/login', strictRateLimiter, handleLogin);

/**
 * POST /api/staff/auth/logout
 */
router.post('/logout', handleLogout);

/**
 * GET /api/staff/auth/me
 * Returns the logged-in agent's claims, or 401 if not authenticated.
 * Used by the frontend on page load to decide login vs dashboard.
 */
router.get('/me', requireAgent, handleMe);

module.exports = router;
