const { login } = require('../services/agentAuthService');
const { COOKIE_NAME } = require('../middleware/agentAuth');

const COOKIE_MAX_AGE_MS = 8 * 60 * 60 * 1000; // matches STAFF_JWT_TTL default (8h)

async function handleLogin(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Validation Error', message: 'Email and password are required.' });
    }

    const result = await login(email, password);
    if (!result) {
      // Deliberately generic — don't reveal whether the email exists.
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid email or password.' });
    }

    res.cookie(COOKIE_NAME, result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: COOKIE_MAX_AGE_MS,
    });

    return res.json({ agent: result.agent });
  } catch (error) {
    return next(error);
  }
}

function handleLogout(req, res) {
  res.clearCookie(COOKIE_NAME);
  return res.json({ success: true });
}

function handleMe(req, res) {
  // req.agent comes from the JWT payload, not a fresh DB read — fine for
  // "am I logged in / what's my role" checks the UI does on every page
  // load; anything permission-sensitive should still be enforced
  // server-side per-endpoint.
  return res.json({ agent: req.agent });
}

module.exports = { handleLogin, handleLogout, handleMe };
