require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');



const chatRoutesV2 = require('./routes/chatV2');
const whatsappRoutes = require('./routes/whatsapp');
const staffAuthRoutes = require('./routes/staffAuth');
const ticketRoutes = require('./routes/tickets');

const { startCleanupScheduler, stopCleanupScheduler } = require('./services/sessionManager');
const { rateLimiter, chatRateLimiter, staffRateLimiter } = require('./middleware/rateLimiter');
const { errorHandler } = require('./middleware/errorHandler');
const { requireAgent } = require('./middleware/agentAuth');

const app = express();
const PORT = process.env.PORT || 3001;

// ─────────────────────────────────────────────────────────────────────────
// MIDDLEWARE ORDER IS LOAD-BEARING — READ BEFORE ADDING A ROUTE
//
// This has already caused one production bug: staff dashboard traffic was
// getting caught by the public per-IP rate limiter because /api/staff/*
// was mounted AFTER app.use(rateLimiter). Do not reorder the blocks below
// without re-reading why each one is where it is.
//
// Required order, top to bottom:
//   1. helmet()                — security headers on every response
//   2. cors()                  — must run before any route handles the
//                                 request, including error responses
//   3. body/cookie parsers     — every route needs req.body/req.cookies
//   4. /health                 — before ANY rate limiter; health checks
//                                 must never be throttled
//   5. /api/chat + chatRateLimiter
//                              — mounted BEFORE the generic `rateLimiter`
//                                 below so chat gets its own (lenient,
//                                 session-keyed) limiter instead of
//                                 double-counting against the public one
//   6. app.use(rateLimiter)    — generic public/per-IP limiter, applies
//                                 to everything mounted AFTER this line
//   7. /api/whatsapp           — has its own whatsappRateLimiter applied
//                                 inside routes/whatsapp.js (keyed by
//                                 phone number, not IP — Twilio shares IPs)
//   8. /api/staff/auth         — login endpoint, public but should stay
//                                 under the generic limiter (brute-force
//                                 protection)
//   9. /api/staff/tickets      — requireAgent MUST run before
//                                 staffRateLimiter, because staffRateLimiter
//                                 keys off req.agent.sub (the authenticated
//                                 agent id), not IP — this is what fixes
//                                 the shared-office-IP collision bug
//
// If you add a new route group, decide explicitly: does it need its own
// rate limiter (like chat/whatsapp/staff), or is the generic public
// `rateLimiter` correct for it? Don't just mount it wherever's convenient.
// ─────────────────────────────────────────────────────────────────────────

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://cicinsurancegroup.com', 'https://www.cicinsurancegroup.com'] 
    : ['http://localhost:3000', 'http://localhost:5173'],
  methods: ['GET', 'POST', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Health check endpoint (no rate limiting needed for health checks)
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    service: 'EasyBima Backend',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// API routes with appropriate rate limiters BEFORE global limiter
// Chat gets lenient session-based rate limiting for natural conversation flow
app.use('/api/chat', chatRateLimiter, chatRoutesV2);

// Apply strict rate limiting to remaining public endpoints AFTER chat (chat already has its own)
app.use(rateLimiter);

// More routes
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/staff/auth', staffAuthRoutes);
// requireAgent runs first so staffRateLimiter can key off the
// authenticated agent's id instead of shared office/NAT IPs — see
// middleware/rateLimiter.js for why this was split out.
app.use('/api/staff/tickets', requireAgent, staffRateLimiter, ticketRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Not Found',
    message: 'The requested resource does not exist.'
  });
});
startCleanupScheduler();

// Global error handler
app.use(errorHandler);
process.on('SIGTERM', () => {
  console.log('⏹️  Shutting down gracefully...');
  stopCleanupScheduler();
  process.exit(0);
});
// Start server
app.listen(PORT, () => {
  console.log(`         Bima AI Chatbot Backend                        `);
  console.log(`         Server running on port: ${PORT}                `);
});

module.exports = app;