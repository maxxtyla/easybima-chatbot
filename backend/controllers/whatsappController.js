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
const { logAnalytics, deleteConversationData, logMessage } = require('../services/conversationService');
const { endSessionInMemory } = require('../services/sessionManager');
const { markPendingEnd, isPendingEnd, clearPendingEnd } = require('../services/whatsappSessionState');
const { closeTicketByCustomer } = require('../services/ticketService');
const twilio = require('twilio');

const { MessagingResponse } = twilio.twiml;

// ── End-chat intent detection ────────────────────────────────────────────
// Whole-message match on purpose (not "includes") so a real question like
// "how do I cancel my policy" or "goodbye, when is your call center open"
// doesn't get misread as a request to end the conversation.
const END_CHAT_PATTERN = /^(end chat|end conversation|end session|close chat|stop|cancel|bye|goodbye|quit|exit)[.!]?$/i;
const AFFIRMATIVE_PATTERN = /^(yes|y|yep|yeah|confirm|confirmed|sure|ok|okay)[.!]?$/i;

// ── Close-ticket intent detection ────────────────────────────────────────
// WhatsApp has no widget UI, so there's no "Close ticket" button to tap the
// way the web chat has — this text command is the WhatsApp equivalent.
// Deliberately distinct from END_CHAT_PATTERN: closing a ticket only ends
// the support ticket (permanently, matching the widget's behaviour), it
// does NOT wipe the chat history / end the whole conversation session.
const CLOSE_TICKET_PATTERN = /^(close ticket|close my ticket)[.!]?$/i;

function buildEndConfirmationPrompt() {
  return "Are you sure you want to end this conversation? This will clear your chat history.\n\n" +
    "Reply *YES* to confirm, or just send your next message to keep chatting.";
}

function buildEndedMessage() {
  return "✅ Your conversation has been ended and the chat history cleared.\n\n" +
    "Send me a message anytime to start a new conversation!";
}

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
      // ── End-chat confirmation flow ───────────────────────────────────
      // Handled entirely outside chatEngine (no RAG/Claude call needed)
      // since it's pure session bookkeeping, not a question to answer.
      if (isPendingEnd(sessionId)) {
        clearPendingEnd(sessionId);

        if (AFFIRMATIVE_PATTERN.test(message)) {
          await logAnalytics(sessionId, 'session_ended_by_user', {
            channel: 'whatsapp',
            timestamp: new Date().toISOString(),
          }).catch(() => {});

          await deleteConversationData(sessionId);
          endSessionInMemory(sessionId);

          await sendWhatsAppMessage(sessionId, buildEndedMessage());
          return;
        }

        // Anything other than an explicit "yes" cancels the end request.
        // Don't just say "okay, continuing" and drop their message — if
        // they typed a real question instead of "no", it still deserves
        // an answer, so fall through to the normal pipeline below.
      } else if (END_CHAT_PATTERN.test(message)) {
        markPendingEnd(sessionId);
        await sendWhatsAppMessage(sessionId, buildEndConfirmationPrompt());
        return;
      } else if (CLOSE_TICKET_PATTERN.test(message)) {
        console.log(`📲 [TICKET CLOSE][WHATSAPP] sessionId=${sessionId} customer sent close-ticket command`);
        const ticket = await closeTicketByCustomer(sessionId);

        if (!ticket) {
          console.log(`📲 [TICKET CLOSE][WHATSAPP] sessionId=${sessionId} no open ticket to close`);
          await sendWhatsAppMessage(sessionId, "You don't have an open ticket right now.");
          return;
        }

        console.log(`📲 [TICKET CLOSE][WHATSAPP] sessionId=${sessionId} ticket=${ticket.ticket_number || ticket.id} closed by customer, sending confirmation`);

        await logMessage(sessionId, 'system', 'Customer closed the ticket.', {
          ticketId: ticket.id,
          channel: 'whatsapp',
        }).catch(() => {});

        await logAnalytics(sessionId, 'ticket_closed_by_customer', {
          ticketId: ticket.id,
          ticketNumber: ticket.ticket_number,
          channel: 'whatsapp',
          timestamp: new Date().toISOString(),
        }).catch(() => {});

        await sendWhatsAppMessage(
          sessionId,
          `✅ Ticket ${ticket.ticket_number ? `#${ticket.ticket_number} ` : ''}closed. Thanks for chatting with us — send a new message anytime if you need more help!`
        );
        return;
      }

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

      if (result.humanHandled) {
        // Agent has taken this session over — the message is already
        // logged for them to see in the ticket transcript. Stay silent
        // here; the agent's reply goes out separately via
        // ticketController.sendMessage -> sendWhatsAppMessage.
        return;
      }

      // Reactive warning fallback: if this message happened to land inside
      // the warning window before the periodic sweep in sessionManager
      // caught it, surface the notice right away instead of waiting up to
      // 60s for the next sweep tick.
      let outgoing = result.aiResponse;

      // Tell WhatsApp customers about the text-command equivalent of the
      // web widget's "Close ticket" button, right when their ticket is
      // created — there's no button to show them here.
      if (result.escalation) {
        outgoing += '\n\n_Once you\'re all sorted, reply "close ticket" to close this support ticket._';
      }

      if (result.sessionStatus?.warningNeeded) {
        const minutesLeft = Math.max(1, Math.round(result.sessionStatus.timeRemainingMs / 60000));
        outgoing += `\n\n⏰ _This conversation will time out in about ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'} due to inactivity. Reply *end chat* to close it now, or just keep chatting._`;
      }

      await sendWhatsAppMessage(sessionId, outgoing);

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