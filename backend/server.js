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
