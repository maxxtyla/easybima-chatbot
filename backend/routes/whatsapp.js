const express = require('express');
const router = express.Router();
const { handleWhatsAppWebhook } = require('../controllers/whatsappController');
const { twilioWebhookAuth } = require('../middleware/twilioAuth');
const { whatsappRateLimiter } = require('../middleware/rateLimiter');

/**
 * POST /api/whatsapp/webhook
 *
 * Configure this as the "WHEN A MESSAGE COMES IN" webhook URL for your
 * Twilio WhatsApp Sender (Sandbox or production number) in the Twilio
 * Console: https://<PUBLIC_BASE_URL>/api/whatsapp/webhook
 *
 * Twilio POSTs application/x-www-form-urlencoded fields including:
 *   From  - "whatsapp:+254712345678" (sender)
 *   To    - "whatsapp:+14155238886" (your Twilio WhatsApp number)
 *   Body  - the message text
 *   ProfileName, NumMedia, MediaUrl0, etc.
 *
 * We respond with TwiML (<Response><Message>...</Message></Response>),
 * which Twilio turns into one or more outbound WhatsApp messages.
 */
router.post('/webhook', whatsappRateLimiter, twilioWebhookAuth, handleWhatsAppWebhook);

/**
 * GET /api/whatsapp/health
 * Quick check that the route is mounted and env is configured —
 * does NOT require Twilio signature (useful for manual curl testing).
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'WhatsApp Webhook',
    configured: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_NUMBER),
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
