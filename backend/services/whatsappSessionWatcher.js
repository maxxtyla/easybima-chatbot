//
// WhatsApp has no client-side JS running on the user's phone, so unlike the
// web widget it can never *ask* "is my session about to expire?". The only
// way to nudge a WhatsApp user toward wrapping up is to push them a message
// proactively, using the Twilio REST API (not tied to any incoming request).
//
// This subscribes to the 'warning' event sessionManager emits from its
// periodic sweep (see cleanupExpiredSessions in sessionManager.js) and, for
// sessions belonging to WhatsApp (sessionId === "whatsapp:+E164"), sends a
// natural closing question rather than technical "your session is expiring"
// language. It intentionally does NOT push anything on actual expiry —
// when a session times out it should just reset silently; the user's next
// message gets answered normally, with no "your session expired" framing.

const { sessionEvents } = require('./sessionManager');
const { sendWhatsAppMessage } = require('./whatsappService');
const { logAnalytics } = require('./conversationService');

const WHATSAPP_PREFIX = 'whatsapp:';

function isWhatsAppSession(sessionId) {
  return typeof sessionId === 'string' && sessionId.startsWith(WHATSAPP_PREFIX);
}

let initialized = false;

function init() {
  if (initialized) return; // idempotent — safe to call more than once
  initialized = true;

  sessionEvents.on('warning', (sessionId) => {
    if (!isWhatsAppSession(sessionId)) return;

    sendWhatsAppMessage(sessionId, 'Is there anything else I can help you with?').catch((err) => {
      console.error(`❌ Failed to send WhatsApp wrap-up prompt to ${sessionId}:`, err.message);
    });

    logAnalytics(sessionId, 'whatsapp_wrap_up_prompt_sent', {
      timestamp: new Date().toISOString(),
    }).catch(() => {});
  });

  console.log('✅ WhatsApp session watcher attached (wrap-up prompt on inactivity)');
}

module.exports = { init };