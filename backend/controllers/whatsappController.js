// ---------------------------------------------------------------------------
// whatsappController.js
//
// Handles inbound Twilio WhatsApp webhook requests. Reuses the exact same
// RAG + Claude pipeline as the web widget via chatEngine.processMessage —
// the only channel-specific work here is:
//   1. Mapping Twilio's `From` number to a stable sessionId so a WhatsApp
//      user's conversation persists across messages without any client-
//      side session management (there's no JS running on WhatsApp).
//   2. Formatting/splitting the reply for WhatsApp and returning TwiML.
// ---------------------------------------------------------------------------

const chatEngine = require('../services/chatEngine');
const { formatForWhatsApp, splitForWhatsApp } = require('../services/whatsappService');
const { logAnalytics } = require('../services/conversationService');
const twilio = require('twilio');

const { MessagingResponse } = twilio.twiml;

async function handleWhatsAppWebhook(req, res) {
  // Twilio sends these as application/x-www-form-urlencoded fields.
  // `From` arrives already prefixed, e.g. "whatsapp:+254712345678" — we
  // use it directly as our sessionId so the conversation is tied to the
  // phone number persistently, no extra mapping table needed.
  const { Body: rawBody, From: from, ProfileName: profileName, NumMedia } = req.body;

  const twiml = new MessagingResponse();

  // We don't currently process images/voice notes/documents sent via
  // WhatsApp — acknowledge them gracefully instead of silently failing.
  if (NumMedia && parseInt(NumMedia, 10) > 0 && (!rawBody || !rawBody.trim())) {
    twiml.message("I can't read images, voice notes, or documents yet — could you type your question instead?");
    res.type('text/xml');
    return res.send(twiml.toString());
  }

  const message = (rawBody || '').trim();

  if (!message) {
    twiml.message("Hi! I'm Bima, your CIC Insurance assistant 🤖. How can I help you today?");
    res.type('text/xml');
    return res.send(twiml.toString());
  }

  if (!from) {
    console.error('❌ WhatsApp webhook missing From field');
    twiml.message('Sorry, something went wrong on our end. Please try again shortly.');
    res.type('text/xml');
    return res.send(twiml.toString());
  }

  const sessionId = from; // e.g. "whatsapp:+254712345678" — stable per user

  try {
    const result = await chatEngine.processMessage({
      message,
      sessionId,
      meta: {
        channel: 'whatsapp',
        userAgent: 'twilio-whatsapp',
        ip: req.ip,
        profileName,
      },
    });

    const formatted = formatForWhatsApp(result.aiResponse);
    const chunks = splitForWhatsApp(formatted);

    for (const chunk of chunks) {
      twiml.message(chunk);
    }

    res.type('text/xml');
    return res.send(twiml.toString());

  } catch (error) {
    console.error('❌ WhatsApp handler error:', error);

    logAnalytics(sessionId, 'whatsapp_error_occurred', {
      error: error.message,
      timestamp: new Date().toISOString(),
    }).catch(() => {});

    twiml.message("Sorry, I ran into a problem processing that. Please try again, or call us on +254 20 2823000.");
    res.type('text/xml');
    return res.send(twiml.toString());
  }
}

module.exports = { handleWhatsAppWebhook };
