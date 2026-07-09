const { verifyToken } = require('../services/agentAuthService');

const COOKIE_NAME = 'staff_token';

/**
 * Verifies the staff JWT (httpOnly cookie, set on login) and attaches the
 * decoded claims to req.agent. Also accepts a Bearer header as a fallback
 * for tooling (Postman/scripts) that doesn't carry cookies.
 */
function requireAgent(req, res, next) {
  const bearer = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : null;
  const token = req.cookies?.[COOKIE_NAME] || bearer;

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Staff login required.' });
  }

  try {
    req.agent = verifyToken(token); // { sub, email, role, fullName, iat, exp }
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired staff session.' });
  }
}

/**
 * Usage: router.patch('/:id/assign', requireAgent, requireRole('supervisor', 'admin'), handler)
 * Must run after requireAgent.
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.agent) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Staff login required.' });
    }
    if (!allowedRoles.includes(req.agent.role)) {
      return res.status(403).json({ error: 'Forbidden', message: 'Insufficient permissions.' });
    }
    return next();
  };
}

module.exports = { requireAgent, requireRole, COOKIE_NAME };
