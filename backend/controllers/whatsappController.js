//
// Handles inbound Twilio WhatsApp webhook requests. Reuses the exact same
// RAG + Claude pipeline as the web widget via chatEngine.processMessage —
// the only channel-specific work here is:
//   1. Mapping Twilio's `From` number to a stable sessionId so a WhatsApp
//      user's conversation persists across messages without any client-
//      side session management (there's no JS running on WhatsApp).
//   2. Formatting/splitting the reply for WhatsApp and returning TwiML.

const chatEngine = require('../services/chatEngine');
const { sendWhatsAppMessage } = require('../services/whatsappService');
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

  // ── Ack the webhook immediately 
  // Twilio gives us ~15s to return TwiML before it drops the request as
  // timed out — and it does this SILENTLY (no error in our logs, nothing
  // delivered to the phone), even though our pipeline finishes fine a few
  // seconds later. The RAG pipeline (DB queries + Claude/OpenRouter call)
  // can intermittently exceed that window, which is why replies sometimes
  // never arrive even though "the backend shows the response was generated".
  //
  // Fix: respond with empty TwiML right away (no timeout pressure), then
  // run the actual pipeline in the background and deliver the real reply
  // via the Twilio REST API (sendWhatsAppMessage), which has no such limit.
  res.type('text/xml');
  res.send(twiml.toString());

  (async () => {
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

      await sendWhatsAppMessage(sessionId, result.aiResponse);

    } catch (error) {
      console.error('❌ WhatsApp handler error:', error);

      logAnalytics(sessionId, 'whatsapp_error_occurred', {
        error: error.message,
        timestamp: new Date().toISOString(),
      }).catch(() => {});

      sendWhatsAppMessage(
        sessionId,
        "Sorry, I ran into a problem processing that. Please try again, or call us on +254 20 2823000."
      ).catch((sendErr) => {
        console.error('❌ Failed to deliver WhatsApp error message:', sendErr);
      });
    }
  })();
}

module.exports = { handleWhatsAppWebhook };