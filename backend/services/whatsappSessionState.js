//
// Tiny in-memory store tracking which WhatsApp sessions are mid-way through
// the "end this conversation?" confirmation exchange.
//
// Kept in its own module (rather than living inside whatsappController.js)
// so that whatsappSessionWatcher.js can also clear a pending confirmation
// when a session times out from inactivity, without the two files needing
// to require each other.
//
// ⚠️  Like sessionManager's activeSessions Map, this is wiped on restart —
//     that's fine here: worst case a user has to re-type "end chat" once
//     after a deploy, they're never left in a stuck state.

const pendingEndConfirmations = new Map(); // sessionId -> requestedAt (ms)

const PENDING_TTL_MS = 5 * 60 * 1000; // if they never reply, stop waiting after 5 min

function markPendingEnd(sessionId) {
  pendingEndConfirmations.set(sessionId, Date.now());
}

function isPendingEnd(sessionId) {
  const requestedAt = pendingEndConfirmations.get(sessionId);
  if (requestedAt === undefined) return false;

  if (Date.now() - requestedAt > PENDING_TTL_MS) {
    pendingEndConfirmations.delete(sessionId);
    return false;
  }
  return true;
}

function clearPendingEnd(sessionId) {
  return pendingEndConfirmations.delete(sessionId);
}

module.exports = { markPendingEnd, isPendingEnd, clearPendingEnd };
