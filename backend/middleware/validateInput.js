const validator = require('validator');

// ─────────────────────────────────────────────────────────────────────────
// IMPORTANT — WHAT THIS MIDDLEWARE IS AND ISN'T:
//
// This is NOT the app's XSS defense boundary. It's a shallow, best-effort
// filter that rejects a few obviously malicious payload shapes before they
// reach the LLM prompt (mainly to stop someone pasting a raw <script> tag
// or javascript: URI into the chat, which would otherwise sit in
// conversation history / ticket transcripts unmodified).
//
// The actual XSS defense is downstream, structural, and doesn't depend on
// this middleware catching everything:
//   - Postgres queries are parameterized ($1/$2) everywhere, so nothing
//     here needs to escape SQL.
//   - The frontend renders AI/agent messages via react-markdown, not
//     dangerouslySetInnerHTML, so arbitrary HTML in a message can't
//     execute even if it slips past this filter.
//
// Do not add reliance on this filter as a security boundary elsewhere in
// the app on the assumption it's "the sanitizer" — it isn't one.
// ─────────────────────────────────────────────────────────────────────────
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

  // Reject obviously malicious payload shapes before they reach the LLM
  // prompt / get persisted to conversation history. This is a narrow
  // blocklist, not a sanitizer — see the module-level comment above.
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