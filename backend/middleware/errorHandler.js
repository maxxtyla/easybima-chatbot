const errorHandler = (err, req, res, next) => {
  console.error('Error:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString(),
  });

  // Anthropic API errors
  if (err.name === 'AnthropicError' || err.message?.includes('anthropic')) {
    return res.status(503).json({
      error: 'AI Service Unavailable',
      message: 'Our AI assistant is temporarily unavailable. Please try again in a moment.',
      escalation: true,
      code: 'AI_SERVICE_ERROR'
    });
  }

  // Database errors
  if (err.code?.startsWith('28') || err.code?.startsWith('08')) {
    return res.status(503).json({
      error: 'Database Error',
      message: 'Unable to access conversation history. Your message was received but not stored.',
      escalation: false,
      code: 'DB_ERROR'
    });
  }

  // Validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation Error',
      message: err.message,
      escalation: false,
      code: 'VALIDATION_ERROR'
    });
  }

  // Rate limit errors
  if (err.statusCode === 429) {
    return res.status(429).json({
      error: 'Rate Limit Exceeded',
      message: 'Too many requests. Please wait a moment before sending another message.',
      escalation: false,
      code: 'RATE_LIMIT'
    });
  }

  // Default error
  res.status(err.status || 500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' 
      ? err.message 
      : 'Something went wrong. Please try again or contact support.',
    escalation: true,
    code: 'INTERNAL_ERROR'
  });
};

module.exports = { errorHandler };