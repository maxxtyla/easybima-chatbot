//
// Twilio client setup + WhatsApp-specific output formatting.
//
// WhatsApp doesn't render Markdown the way a web chat widget does:
//   - **bold** in our prompts/responses should become *bold* (single
//     asterisks are WhatsApp's bold syntax)
//   - [text](url) markdown links aren't rendered — show the raw URL instead
//   - messages over ~1600 chars get rejected/truncated by WhatsApp, so
//     long replies must be split into multiple messages

const twilio = require('twilio');

const WHATSAPP_MAX_CHARS = 1500; // stay safely under Twilio/WhatsApp's 1600 char cap

let client = null;
function getClient() {
  if (!client) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) {
      throw new Error('TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not configured');
    }
    client = twilio(sid, token);
  }
  return client;
}

/**
 * Convert our markdown-ish bot output into WhatsApp-friendly formatting.
 */
function formatForWhatsApp(text) {
  if (!text) return text;

  let out = text;

  // **bold** -> *bold*  (WhatsApp bold is single asterisk)
  out = out.replace(/\*\*(.+?)\*\*/g, '*$1*');

  // [label](url) -> "label: url" (WhatsApp has no clickable markdown links,
  // but raw URLs are auto-linked, so keep both the label and the URL)
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1: $2');

  // Strip stray markdown headers (#, ##, ###) — just keep the text
  out = out.replace(/^#{1,6}\s*/gm, '');

  // Collapse 3+ blank lines down to 2 (WhatsApp renders extra whitespace
  // visually noisy on mobile)
  out = out.replace(/\n{3,}/g, '\n\n');

  return out.trim();
}

/**
 * Split a long message into WhatsApp-safe chunks, breaking on paragraph or
 * sentence boundaries where possible rather than mid-word.
 */
function splitForWhatsApp(text, maxLen = WHATSAPP_MAX_CHARS) {
  if (!text || text.length <= maxLen) return [text];

  const chunks = [];
  let remaining = text;

  while (remaining.length > maxLen) {
    // Prefer to break at the last paragraph break before the limit,
    // falling back to the last sentence end, falling back to a hard cut.
    let cut = remaining.lastIndexOf('\n\n', maxLen);
    if (cut < maxLen * 0.4) cut = remaining.lastIndexOf('. ', maxLen);
    if (cut < maxLen * 0.4) cut = maxLen;
    else if (remaining[cut] === '.') cut += 1; // keep the period in this chunk

    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }

  if (remaining.length > 0) chunks.push(remaining);

  return chunks;
}

/**
 * Send a WhatsApp message proactively via the REST API (as opposed to
 * replying inline via TwiML). Used for things like a session-expiry notice
 * triggered by a background job, not directly inside the webhook request.
 */
async function sendWhatsAppMessage(toWhatsAppNumber, body) {
  const from = process.env.TWILIO_WHATSAPP_NUMBER;
  if (!from) throw new Error('TWILIO_WHATSAPP_NUMBER not configured');

  const formatted = formatForWhatsApp(body);
  const chunks = splitForWhatsApp(formatted);

  const c = getClient();
  const results = [];
  for (const chunk of chunks) {
    // eslint-disable-next-line no-await-in-loop
    const msg = await c.messages.create({
      from: from.startsWith('whatsapp:') ? from : `whatsapp:${from}`,
      to: toWhatsAppNumber.startsWith('whatsapp:') ? toWhatsAppNumber : `whatsapp:${toWhatsAppNumber}`,
      body: chunk,
    });
    results.push(msg.sid);
  }
  return results;
}

module.exports = {
  formatForWhatsApp,
  splitForWhatsApp,
  sendWhatsAppMessage,
  WHATSAPP_MAX_CHARS,
};
