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

/**
 * Social links, same pattern as WhatsApp above: configure via env vars so
 * these can change without a code deploy. Fall back to CIC's public
 * handles/pages if no env var is set.
 */
export const SOCIAL_LINKS = {
  x: process.env.NEXT_PUBLIC_X_URL || 'https://twitter.com/cicgroupplc',
  facebook: process.env.NEXT_PUBLIC_FACEBOOK_URL || 'https://facebook.com/CICGroupPLC',
  youtube: process.env.NEXT_PUBLIC_YOUTUBE_URL || 'https://www.youtube.com/c/CICInsuranceGroupKe',
  instagram: process.env.NEXT_PUBLIC_INSTAGRAM_URL || 'LINK https://www.instagram.com/cicgroupplc',
}
