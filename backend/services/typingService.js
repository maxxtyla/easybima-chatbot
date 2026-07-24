// Lightweight in-memory "is someone typing" tracker, keyed by sessionId.
//
// Not persisted to the DB — a typing indicator disappearing on a server
// restart is an acceptable trade-off for how ephemeral this signal is.
// Entries auto-expire after TYPING_TTL_MS so a client that stops sending
// heartbeats (closed tab, dropped connection, network blip) doesn't leave
// a stale "typing…" indicator stuck on the other side forever — the
// frontend nudges this by pinging every ~2s while the user is actively
// typing, well under the TTL.
//
// Two independent widgets read/write this: the public chat widget (side
// 'customer', keyed straight off sessionId) and the staff ticket detail
// page (side 'agent', keyed off the ticket's session_id — see
// ticketController.setTyping).

const TYPING_TTL_MS = 6000;

/** @type {Map<string, { customer: number | null, agent: number | null }>} */
const typingState = new Map();

function setTyping(sessionId, side, isTyping) {
  if (!sessionId || (side !== 'customer' && side !== 'agent')) return;
  const entry = typingState.get(sessionId) || { customer: null, agent: null };
  entry[side] = isTyping ? Date.now() : null;
  typingState.set(sessionId, entry);
}

function _isFresh(ts) {
  return typeof ts === 'number' && Date.now() - ts < TYPING_TTL_MS;
}

function isTyping(sessionId, side) {
  const entry = typingState.get(sessionId);
  if (!entry) return false;
  return _isFresh(entry[side]);
}

function getStatus(sessionId) {
  return {
    customerTyping: isTyping(sessionId, 'customer'),
    agentTyping: isTyping(sessionId, 'agent'),
  };
}

module.exports = { setTyping, isTyping, getStatus };
