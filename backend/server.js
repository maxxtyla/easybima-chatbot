require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');



const chatRoutesV2 = require('./routes/chatV2');

const { startCleanupScheduler, stopCleanupScheduler } = require('./services/sessionManager');
const { rateLimiter } = require('./middleware/rateLimiter');
const { errorHandler } = require('./middleware/errorHandler');

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
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
app.use(rateLimiter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    service: 'EasyBima Backend',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// API routes
app.use('/api/chat', chatRoutesV2);

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
  console.log(`╔════════════════════════════════════════════════════════════╗`);
  console.log(`║           Bima AI Chatbot Backend                          ║`);
  console.log(`║           CIC Insurance Group - Kenya                      ║`);
  console.log(`╠════════════════════════════════════════════════════════════╣`);
  console.log(`║           Server running on port: ${PORT}                           ║`);
  console.log(`╚════════════════════════════════════════════════════════════╝`);
});

module.exports = app;