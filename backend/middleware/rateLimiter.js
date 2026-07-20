const rateLimit = require('express-rate-limit');
const { RATE_LIMIT } = require('../config/constants');

// STRICT limiter for unauthenticated public endpoints
// Protects against abuse but keeps limits reasonable
const rateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || RATE_LIMIT.WINDOW_MS,
  max: RATE_LIMIT.PUBLIC_MAX,
  message: {
    error: 'Too many requests',
    message: 'You have exceeded the rate limit. Please try again later.',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Staff dashboard traffic gets its own, agent-keyed limiter (see
  // staffRateLimiter below) applied after requireAgent — skip it here so
  // authenticated staff requests aren't ALSO counted against the public
  // per-IP bucket (that double-counting was the root cause of staff
  // seeing "rate limit exceeded" errors).
  skip: (req) => req.path.startsWith('/api/staff'),
  keyGenerator: (req) => req.ip || req.connection.remoteAddress || 'unknown',
  handler: (req, res, next, options) => {
    res.status(429).json(options.message);
  },
});

// LENIENT limiter for chat endpoints
// Session-based rate limiting allows conversations to flow naturally
// without hitting rate limits from rapid back-and-forth messages
const chatRateLimiter = rateLimit({
  windowMs: RATE_LIMIT.WINDOW_MS,
  max: RATE_LIMIT.CHAT_MAX, // 100 messages per minute per session is very generous
  message: {
    error: 'Too many requests',
    message: 'Too many messages. Please slow down.',
    code: 'CHAT_RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip for WhatsApp webhooks (they come from shared Twilio IPs)
    if (req.path.startsWith('/api/whatsapp')) return true;
    return false;
  },
  keyGenerator: (req) => {
    // Use session ID for chat endpoints to rate limit per conversation
    // Falls back to IP if no session provided
    return req.body?.sessionId || req.ip || req.connection.remoteAddress || 'unknown';
  },
  handler: (req, res, next, options) => {
    res.status(429).json(options.message);
  },
});

// LENIENT limiter for the staff dashboard (agent-facing, authenticated).
// BUG FIX: staff/customer-management traffic was previously falling under
// the generic public `rateLimiter` below (30 req/min per IP), because
// `/api/staff/tickets` is mounted AFTER `app.use(rateLimiter)` in
// server.js. That limiter was designed for anonymous public traffic, but
// the staff dashboard polls the ticket queue every 30s AND polls an open
// ticket's live transcript every 5s (~12 req/min just for one open
// ticket) — and multiple agents in the same office share one outbound IP,
// so their requests all counted against the SAME 30/min bucket. That's
// exactly what produced the "you have exceeded the rate limit" errors in
// staff customer management.
//
// Fix: give staff endpoints their own, much more generous limiter, keyed
// by the authenticated agent's id (not shared IP) so agents never throttle
// each other. This must be mounted AFTER requireAgent so req.agent exists.
const staffRateLimiter = rateLimit({
  windowMs: RATE_LIMIT.WINDOW_MS,
  max: RATE_LIMIT.STAFF_MAX,
  message: {
    error: 'Too many requests',
    message: 'Too many requests from the staff dashboard. Please slow down.',
    code: 'STAFF_RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.agent?.sub || req.ip || req.connection.remoteAddress || 'unknown',
  handler: (req, res, next, options) => {
    res.status(429).json(options.message);
  },
});

// Stricter limiter for specific endpoints
const strictRateLimiter = rateLimit({
  windowMs: RATE_LIMIT.WINDOW_MS,
  max: RATE_LIMIT.STRICT_MAX,
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
  windowMs: RATE_LIMIT.WINDOW_MS,
  max: RATE_LIMIT.WHATSAPP_MAX,
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

module.exports = { rateLimiter, chatRateLimiter, strictRateLimiter, whatsappRateLimiter, staffRateLimiter };