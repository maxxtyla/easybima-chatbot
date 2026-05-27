const { pool } = require('../config/database');

/**
 * In-memory session manager
 * Tracks active conversations with inactivity timeouts
 * 
 * Professional approach:
 * - Keeps lightweight in-memory state for active sessions
 * - Falls back to database for persistence
 * - Handles pre-expiration warnings
 * - Clean expiration with notification
 */

// Configuration
const SESSION_CONFIG = {
  TIMEOUT_MS: 480000, // 8 minutes
  WARNING_THRESHOLD_MS: 15000, // Warn at 1m 45s (15s before expiry)
  CLEANUP_INTERVAL_MS: 60000, // Check for expired sessions every 60s
};

// In-memory session store: { sessionId: { expiryTime, warningShown, data } }
const activeSessions = new Map();

/**
 * Initialize a session when user starts typing
 */
async function initializeSession(sessionId) {
  try {
    const now = Date.now();
    const expiryTime = now + SESSION_CONFIG.TIMEOUT_MS;

    // Create in database
    await pool.query(
      `INSERT INTO conversations (session_id, last_activity_at) 
       VALUES ($1, NOW()) 
       ON CONFLICT (session_id) 
       DO UPDATE SET last_activity_at = NOW()`,
      [sessionId]
    );

    // Track in memory
    activeSessions.set(sessionId, {
      expiryTime,
      warningShown: false,
      createdAt: now,
      lastActivityAt: now,
    });

    console.log(`✅ Session initialized: ${sessionId}`);
    return true;
  } catch (error) {
    console.error('Error initializing session:', error);
    throw error;
  }
}

/**
 * Update session activity timestamp
 * Called every time user sends a message
 */
async function updateSessionActivity(sessionId) {
  try {
    const now = Date.now();
    const newExpiryTime = now + SESSION_CONFIG.TIMEOUT_MS;

    // Update in database
    await pool.query(
      `UPDATE conversations 
       SET last_activity_at = NOW(), updated_at = NOW() 
       WHERE session_id = $1`,
      [sessionId]
    );

    // Reset in-memory tracking
    if (activeSessions.has(sessionId)) {
      activeSessions.set(sessionId, {
        ...activeSessions.get(sessionId),
        expiryTime: newExpiryTime,
        lastActivityAt: now,
        warningShown: false, // Reset warning flag on new activity
      });
    } else {
      // Session not in memory, initialize it
      await initializeSession(sessionId);
    }

    return true;
  } catch (error) {
    console.error('Error updating session activity:', error);
    throw error;
  }
}

/**
 * Check session status and return expiration data
 * Returns: { isActive, warningNeeded, timeRemainingMs, isExpired }
 */
function checkSessionStatus(sessionId) {
  const now = Date.now();
  const session = activeSessions.get(sessionId);

  if (!session) {
    return {
      isActive: false,
      warningNeeded: false,
      timeRemainingMs: 0,
      isExpired: true,
      reason: 'Session not found in memory',
    };
  }

  const timeRemainingMs = session.expiryTime - now;

  // Session has expired
  if (timeRemainingMs <= 0) {
    activeSessions.delete(sessionId);
    return {
      isActive: false,
      warningNeeded: false,
      timeRemainingMs: 0,
      isExpired: true,
      reason: 'Session timeout reached',
    };
  }

  // Warning threshold reached and not yet shown
  const warningNeeded =
    timeRemainingMs <= SESSION_CONFIG.WARNING_THRESHOLD_MS &&
    !session.warningShown;

  if (warningNeeded) {
    // Mark warning as shown
    activeSessions.set(sessionId, {
      ...session,
      warningShown: true,
    });
  }

  return {
    isActive: true,
    warningNeeded,
    timeRemainingMs,
    isExpired: false,
    reason: 'Active',
  };
}

/**
 * Get conversation with expiration check
 * This is called before retrieving conversation history
 */
async function getConversationWithExpirationCheck(sessionId) {
  try {
    const status = checkSessionStatus(sessionId);

    if (status.isExpired) {
      // Return data about expired session, don't fetch old messages
      return {
        sessionId,
        messages: [],
        isExpired: true,
        expirationReason: status.reason,
      };
    }

    // Fetch from database
    const result = await pool.query(
      `SELECT * FROM conversations WHERE session_id = $1`,
      [sessionId]
    );

    if (result.rows.length === 0) {
      return {
        sessionId,
        messages: [],
        isExpired: false,
        isNewSession: true,
      };
    }

    const conv = result.rows[0];

    // Fetch messages
    const messagesResult = await pool.query(
      `SELECT id, role, content, created_at 
       FROM messages 
       WHERE session_id = $1 
       ORDER BY created_at ASC`,
      [sessionId]
    );

    return {
      sessionId,
      conversationId: conv.id,
      messages: messagesResult.rows,
      isExpired: false,
      isNewSession: false,
      createdAt: conv.created_at,
      lastActivityAt: conv.last_activity_at,
    };
  } catch (error) {
    console.error('Error getting conversation with expiration check:', error);
    throw error;
  }
}

/**
 * Clean up expired sessions (run periodically)
 */
async function cleanupExpiredSessions() {
  try {
    const now = Date.now();
    const expiredSessions = [];

    // Find expired sessions in memory
    for (const [sessionId, session] of activeSessions.entries()) {
      if (session.expiryTime <= now) {
        activeSessions.delete(sessionId);
        expiredSessions.push(sessionId);
      }
    }

    if (expiredSessions.length > 0) {
      console.log(`🧹 Cleaned up ${expiredSessions.length} expired sessions`);
    }

    // Optional: Mark old sessions as archived in database (optional)
    // This deletes conversations older than 24 hours
    const cutoffTime = new Date(Date.now() - 86400000).toISOString(); // 24 hours
    await pool.query(
      `UPDATE conversations 
       SET metadata = jsonb_set(
         COALESCE(metadata, '{}'), 
         '{archived}', 
         'true'
       ) 
       WHERE updated_at < $1 AND metadata->>'archived' IS NULL`,
      [cutoffTime]
    );

    return { cleaned: expiredSessions.length };
  } catch (error) {
    console.error('Error cleaning up expired sessions:', error);
    return { cleaned: 0, error: error.message };
  }
}

/**
 * Start periodic cleanup (call this once in server startup)
 */
let cleanupInterval;

function startCleanupScheduler() {
  if (cleanupInterval) {
    console.log('⚠️ Cleanup scheduler already running');
    return;
  }

  cleanupInterval = setInterval(() => {
    cleanupExpiredSessions();
  }, SESSION_CONFIG.CLEANUP_INTERVAL_MS);

  console.log('✅ Session cleanup scheduler started');
}

function stopCleanupScheduler() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    console.log('❌ Session cleanup scheduler stopped');
  }
}

/**
 * Get session stats (useful for monitoring)
 */
function getSessionStats() {
  return {
    activeSessions: activeSessions.size,
    sessionConfig: SESSION_CONFIG,
    timestamp: new Date().toISOString(),
  };
}

module.exports = {
  initializeSession,
  updateSessionActivity,
  checkSessionStatus,
  getConversationWithExpirationCheck,
  cleanupExpiredSessions,
  startCleanupScheduler,
  stopCleanupScheduler,
  getSessionStats,
};
