const validator = require('validator');

const validateInput = (req, res, next) => {
  const { message, sessionId } = req.body;

  // Validate message
  if (!message || typeof message !== 'string') {
    return res.status(400).json({
      error: 'Message is required',
      code: 'MISSING_MESSAGE',
    });
  }

  if (message.trim().length === 0) {
    return res.status(400).json({
      error: 'Message cannot be empty',
      code: 'EMPTY_MESSAGE',
    });
  }

  if (message.length > 2000) {
    return res.status(400).json({
      error: 'Message too long (max 2000 characters)',
      code: 'MESSAGE_TOO_LONG',
    });
  }

  //  use trim() only — do NOT use validator.escape() here.
  // validator.escape() converts apostrophes/quotes to HTML entities (&#x27; etc.)
  // which corrupts the plain-text prompt sent to the AI model.
  const sanitizedMessage = message.trim();

  // Block actual script injection patterns before passing to AI
  const suspiciousPatterns = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(sanitizedMessage)) {
      return res.status(400).json({
        error: 'Potentially malicious input detected',
        code: 'SUSPICIOUS_INPUT',
      });
    }
  }

  // Validate session ID if provided
  let validatedSessionId = sessionId;
  if (sessionId && !validator.isUUID(sessionId)) {
    validatedSessionId = null;
  }

  // Attach sanitized data to request
  req.body.message = sanitizedMessage;
  req.body.sessionId = validatedSessionId;

  next();
};

module.exports = { validateInput };