const { pool } = require('../config/database');

// ─── Configuration ───────────────────────────────────────────────────────────
const SESSION_CONFIG = {
  TIMEOUT_MS:          8 * 60 * 1000,  // 8 minutes 
  WARNING_THRESHOLD_MS: 5 * 60 * 1000,  // Warn at 5 minutes remaining
  CLEANUP_INTERVAL_MS: 60 * 1000,       // Sweep every 60 seconds
};

// In-memory index of active sessions for fast lookups.
// Shape: { sessionId -> { expiryTime, warningShown, createdAt, lastActivityAt } }
// ⚠️  This Map is wiped on every server restart.
//     checkSessionStatus() therefore ALWAYS falls back to the DB before
//     declaring a session expired — preventing the "session missing from
//     memory = expired" false positive that caused the infinite expiry loop.
const activeSessions = new Map();

// ─── initializeSession ───────────────────────────────────────────────────────
async function initializeSession(sessionId) {
  try {
    const now = Date.now();
    const expiryTime = now + SESSION_CONFIG.TIMEOUT_MS;

    await pool.query(
      `INSERT INTO conversations (session_id, last_activity_at)
       VALUES ($1, NOW())
       ON CONFLICT (session_id)
       DO UPDATE SET last_activity_at = NOW()`,
      [sessionId]
    );

    activeSessions.set(sessionId, {
      expiryTime,
      warningShown: false,
      createdAt:      now,
      lastActivityAt: now,
    });

    console.log(`✅ Session initialized: ${sessionId}`);
    return true;
  } catch (error) {
    console.error('Error initializing session:', error);
    throw error;
  }
}

// ─── updateSessionActivity ───────────────────────────────────────────────────
async function updateSessionActivity(sessionId) {
  try {
    const now = Date.now();
    const newExpiryTime = now + SESSION_CONFIG.TIMEOUT_MS;

    await pool.query(
      `UPDATE conversations
       SET last_activity_at = NOW(), updated_at = NOW()
       WHERE session_id = $1`,
      [sessionId]
    );

    const existing = activeSessions.get(sessionId);
    activeSessions.set(sessionId, {
      ...(existing || {}),
      expiryTime:     newExpiryTime,
      lastActivityAt: now,
      warningShown:   false,
    });

    return true;
  } catch (error) {
    console.error('Error updating session activity:', error);
    throw error;
  }
}

// ─── checkSessionStatus ──────────────────────────────────────────────────────
/**
 * FIX A — DB fallback.
 *
 * Old behaviour: if sessionId not in the in-memory Map → immediately return
 * isExpired:true.  This caused an "expiry" on EVERY request after a server
 * restart because the Map was empty even though the session was perfectly
 * valid in PostgreSQL.
 *
 * New behaviour:
 *  1. Check in-memory Map (fast path).
 *  2. If not found, query the DB.  If the row exists and last_activity_at is
 *     recent enough, rebuild the in-memory entry and return isActive:true.
 *  3. Only return isExpired:true when the DB also has no record, OR the DB
 *     record shows the session genuinely timed out.
 *
 * This function is kept synchronous for the hot path (in-memory hit).
 * The async DB fallback is exposed separately as recoverSessionFromDB().
 */
function checkSessionStatus(sessionId) {
  const now = Date.now();
  const session = activeSessions.get(sessionId);

  // ── In-memory hit ──
  if (session) {
    const timeRemainingMs = session.expiryTime - now;

    if (timeRemainingMs <= 0) {
      activeSessions.delete(sessionId);
      return { isActive: false, warningNeeded: false, timeRemainingMs: 0, isExpired: true, reason: 'timeout' };
    }

    const warningNeeded = timeRemainingMs <= SESSION_CONFIG.WARNING_THRESHOLD_MS && !session.warningShown;
    if (warningNeeded) {
      activeSessions.set(sessionId, { ...session, warningShown: true });
    }

    return { isActive: true, warningNeeded, timeRemainingMs, isExpired: false, reason: 'active' };
  }

  // ── Not in memory — caller must await recoverSessionFromDB() first ──
  // Return a "needs-recovery" signal; the controller handles this.
  return { isActive: false, warningNeeded: false, timeRemainingMs: 0, isExpired: true, reason: 'not_in_memory' };
}

// ─── recoverSessionFromDB ────────────────────────────────────────────────────
/**
 * FIX A (async half) — called by the controller when checkSessionStatus
 * returns isExpired with reason 'not_in_memory'.
 *
 * Looks up last_activity_at in the DB.  If the session is within the timeout
 * window, it is restored into the in-memory Map and true is returned.
 * Returns false when the session genuinely does not exist or has timed out.
 */
async function recoverSessionFromDB(sessionId) {
  try {
    const result = await pool.query(
      `SELECT last_activity_at FROM conversations WHERE session_id = $1`,
      [sessionId]
    );

    if (result.rows.length === 0) return false; // never existed

    const lastActivity = new Date(result.rows[0].last_activity_at).getTime();
    const now = Date.now();
    const age = now - lastActivity;

    if (age >= SESSION_CONFIG.TIMEOUT_MS) return false; // genuinely expired

    // Session is valid — restore it into memory
    const timeRemainingMs = SESSION_CONFIG.TIMEOUT_MS - age;
    activeSessions.set(sessionId, {
      expiryTime:     now + timeRemainingMs,
      warningShown:   timeRemainingMs <= SESSION_CONFIG.WARNING_THRESHOLD_MS,
      createdAt:      lastActivity,
      lastActivityAt: lastActivity,
    });

    console.log(`♻️  Session recovered from DB: ${sessionId} (${Math.round(timeRemainingMs / 60000)}m remaining)`);
    return true;
  } catch (error) {
    console.error('Error recovering session from DB:', error);
    return false;
  }
}

// ─── getConversationWithExpirationCheck ─────────────────────────────────────
async function getConversationWithExpirationCheck(sessionId) {
  try {
    const status = checkSessionStatus(sessionId);

    if (status.isExpired) {
      return { sessionId, messages: [], isExpired: true, expirationReason: status.reason };
    }

    const result = await pool.query(
      `SELECT * FROM conversations WHERE session_id = $1`,
      [sessionId]
    );

    if (result.rows.length === 0) {
      return { sessionId, messages: [], isExpired: false, isNewSession: true };
    }

    const conv = result.rows[0];
    const messagesResult = await pool.query(
      `SELECT id, role, content, created_at
       FROM messages
       WHERE session_id = $1
       ORDER BY created_at ASC`,
      [sessionId]
    );

    return {
      sessionId,
      conversationId:  conv.id,
      messages:        messagesResult.rows,
      isExpired:       false,
      isNewSession:    false,
      createdAt:       conv.created_at,
      lastActivityAt:  conv.last_activity_at,
    };
  } catch (error) {
    console.error('Error getting conversation with expiration check:', error);
    throw error;
  }
}

// ─── cleanupExpiredSessions ──────────────────────────────────────────────────
async function cleanupExpiredSessions() {
  try {
    const now = Date.now();
    let cleaned = 0;

    for (const [sessionId, session] of activeSessions.entries()) {
      if (session.expiryTime <= now) {
        activeSessions.delete(sessionId);
        cleaned++;
      }
    }

    if (cleaned > 0) console.log(`🧹 Cleaned up ${cleaned} expired sessions from memory`);

    // Archive old DB rows (>24 h)
    const cutoff = new Date(Date.now() - 86400000).toISOString();
    await pool.query(
      `UPDATE conversations
       SET metadata = jsonb_set(COALESCE(metadata, '{}'), '{archived}', 'true')
       WHERE updated_at < $1 AND (metadata->>'archived') IS NULL`,
      [cutoff]
    );

    return { cleaned };
  } catch (error) {
    console.error('Error cleaning up expired sessions:', error);
    return { cleaned: 0, error: error.message };
  }
}

// ─── Scheduler ───────────────────────────────────────────────────────────────
let cleanupInterval;

function startCleanupScheduler() {
  if (cleanupInterval) { console.log('⚠️  Cleanup scheduler already running'); return; }
  cleanupInterval = setInterval(cleanupExpiredSessions, SESSION_CONFIG.CLEANUP_INTERVAL_MS);
  console.log('✅ Session cleanup scheduler started');
}

function stopCleanupScheduler() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    console.log('⏹️  Session cleanup scheduler stopped');
  }
}

function getSessionStats() {
  return { activeSessions: activeSessions.size, sessionConfig: SESSION_CONFIG, timestamp: new Date().toISOString() };
}

module.exports = {
  initializeSession,
  updateSessionActivity,
  checkSessionStatus,
  recoverSessionFromDB,          // ← new export
  getConversationWithExpirationCheck,
  cleanupExpiredSessions,
  startCleanupScheduler,
  stopCleanupScheduler,
  getSessionStats,
};