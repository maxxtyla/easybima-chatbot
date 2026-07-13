/**
 * "Chat with us on WhatsApp" hands the customer off to the Twilio-powered
 * WhatsApp Business number. Twilio's WhatsApp channel is reached the same
 * way any WhatsApp number is — a wa.me deep link with the number Twilio
 * has provisioned/verified for the CIC WhatsApp Business Sender. Twilio
 * itself only handles what happens *after* the customer lands in the
 * chat (routing the inbound message into your Conversations/Flow setup);
 * the frontend's job is just to open WhatsApp pointed at that number with
 * a sensible pre-filled message.
 *
 * Configure via env vars so this can point at sandbox vs production
 * WhatsApp senders without a code change:
 *   NEXT_PUBLIC_WHATSAPP_NUMBER   e.g. "254700000000" (no "+", no spaces)
 *   NEXT_PUBLIC_WHATSAPP_PREFILL  optional custom greeting text
 */
const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '254700000000'

const DEFAULT_PREFILL = "Hi, I'd like to chat with CIC Insurance customer care."

export function getWhatsAppChatUrl(prefillOverride?: string): string {
  const text = prefillOverride || process.env.NEXT_PUBLIC_WHATSAPP_PREFILL || DEFAULT_PREFILL
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`
}
