const rateLimit = require('express-rate-limit');

const rateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60 * 1000, // 1 minute
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 30,
  message: {
    error: 'Too many requests',
    message: 'You have exceeded the rate limit. Please try again later.',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.startsWith('/api/whatsapp'),
  keyGenerator: (req) => {
    // Use IP address + session ID if available for more granular limiting
    return req.ip || req.connection.remoteAddress || 'unknown';
  },
  handler: (req, res, next, options) => {
    res.status(429).json(options.message);
  },
});

// Stricter limiter for specific endpoints
const strictRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
  message: {
    error: 'Too many requests',
    message: 'This endpoint has a stricter rate limit. Please slow down.',
    code: 'STRICT_RATE_LIMIT'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Webhook traffic (Twilio) comes from Twilio's shared IP pool, not the
// end user's IP, so IP-based limiting would throttle ALL WhatsApp users
// together. Key by the sender's WhatsApp number instead, and allow a
// generous burst since real conversations can be fast back-and-forth.
const whatsappRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: parseInt(process.env.WHATSAPP_RATE_LIMIT_MAX) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.body?.From || req.ip || 'unknown',
  handler: (req, res) => {
    // Twilio expects TwiML (or at least a 200) — responding with plain
    // JSON 429 here is fine since Twilio just logs delivery failure,
    // but we keep the body minimal.
    res.status(429).send('Too many messages, please slow down.');
  },
});

module.exports = { rateLimiter, strictRateLimiter, whatsappRateLimiter };