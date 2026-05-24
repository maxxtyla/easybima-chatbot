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

module.exports = { rateLimiter, strictRateLimiter };