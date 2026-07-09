const { pool } = require('../config/database');
const crypto = require('crypto');

/**
 * Get or create a conversation
 */
async function getConversation(sessionId) {
  try {
    // Check if conversation exists
    const existingResult = await pool.query(
      'SELECT * FROM conversations WHERE session_id = $1',
      [sessionId]
    );

    if (existingResult.rows.length > 0) {
      // Get messages for this conversation
      const messagesResult = await pool.query(
        'SELECT * FROM messages WHERE session_id = $1 ORDER BY timestamp ASC',
        [sessionId]
      );

      return {
        id: existingResult.rows[0].id,
        sessionId: existingResult.rows[0].session_id,
        messages: messagesResult.rows.map(msg => ({
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
        })),
        wasExpired: false,
      };
    } else {
      // Create new conversation
      const createResult = await pool.query(
        'INSERT INTO conversations (session_id) VALUES ($1) RETURNING *',
        [sessionId]
      );

      return {
        id: createResult.rows[0].id,
        sessionId: createResult.rows[0].session_id,
        messages: [],
        wasExpired: false,
      };
    }
  } catch (error) {
    console.error('Error getting conversation:', error);
    throw error;
  }
}

/**
 * Save conversation with updated history
 */
async function saveConversation(sessionId, messages, metadata = {}) {
  try {
    // Ensure conversation exists
    const convResult = await pool.query(
      'SELECT * FROM conversations WHERE session_id = $1',
      [sessionId]
    );

    if (convResult.rows.length === 0) {
      // Create if doesn't exist
      await pool.query(
        'INSERT INTO conversations (session_id) VALUES ($1)',
        [sessionId]
      );
    }

    // Delete old messages for this session
    await pool.query(
      'DELETE FROM messages WHERE session_id = $1',
      [sessionId]
    );

    // Insert new messages
    for (const msg of messages) {
      await pool.query(
        'INSERT INTO messages (session_id, role, content, timestamp) VALUES ($1, $2, $3, $4)',
        [sessionId, msg.role, msg.content, msg.timestamp || new Date().toISOString()]
      );
    }

    // Update conversation updated_at
    await pool.query(
      'UPDATE conversations SET updated_at = NOW() WHERE session_id = $1',
      [sessionId]
    );

    return true;
  } catch (error) {
    console.error('Error saving conversation:', error);
    throw error;
  }
}

/**
 * Log a message (now just updates the conversation)
 */
async function logMessage(sessionId, role, content, metadata = {}) {
  try {
    // Ensure conversation exists
    const convResult = await pool.query(
      'SELECT * FROM conversations WHERE session_id = $1',
      [sessionId]
    );

    if (convResult.rows.length === 0) {
      // Create if doesn't exist
      await pool.query(
        'INSERT INTO conversations (session_id) VALUES ($1)',
        [sessionId]
      );
    }

    // Insert message
    await pool.query(
      'INSERT INTO messages (session_id, role, content, timestamp) VALUES ($1, $2, $3, NOW())',
      [sessionId, role, content]
    );

    // Update conversation updated_at
    await pool.query(
      'UPDATE conversations SET updated_at = NOW() WHERE session_id = $1',
      [sessionId]
    );

    return true;
  } catch (error) {
    console.error('Error logging message:', error);
    throw error;
  }
}

/**
 * Log analytics event
 */
async function logAnalytics(sessionId, eventType, eventData = {}) {
  try {
    await pool.query(
      `INSERT INTO analytics (session_id, event_type, event_data) 
       VALUES ($1, $2, $3)`,
      [sessionId, eventType, JSON.stringify(eventData)]
    );
    return true;
  } catch (error) {
    console.error('Error logging analytics:', error);
    // Don't throw - analytics errors shouldn't break the chat
    return false;
  }
}

/**
 * Generate a unique session ID
 */
function generateSessionId() {
  return crypto.randomUUID();
}

/**
 * Clear expired sessions (optional - for cleanup)
 */
async function clearExpiredSessions(timeoutMs = 1800000) {
  try {
    const cutoffTime = new Date(Date.now() - timeoutMs).toISOString();
    
    await pool.query(
      `DELETE FROM conversations 
       WHERE updated_at < $1`,
      [cutoffTime]
    );

    return true;
  } catch (error) {
    console.error('Error clearing expired sessions:', error);
    return false;
  }
}

/**
 * Permanently delete a session's chat content when the user explicitly
 * ends the conversation (as opposed to it idling out).
 *
 * - All messages for the session are deleted (this is the actual chat
 *   content the user wants wiped).
 * - The conversation row is kept but flagged as ended, rather than hard
 *   deleted, so it doesn't collide with any FK from the analytics table
 *   and so we retain a lightweight audit trail (no message content) of
 *   when sessions were explicitly closed.
 */
async function deleteConversationData(sessionId) {
  try {
    await pool.query('DELETE FROM messages WHERE session_id = $1', [sessionId]);

    await pool.query(
      `UPDATE conversations
       SET metadata = jsonb_set(COALESCE(metadata, '{}'), '{endedByUser}', 'true'),
           updated_at = NOW()
       WHERE session_id = $1`,
      [sessionId]
    );

    return true;
  } catch (error) {
    console.error('Error deleting conversation data:', error);
    throw error;
  }
}

/**
 * Clears a session's message history when it has genuinely timed out from
 * inactivity (as opposed to the user explicitly ending it — see
 * deleteConversationData above).
 *
 * WhatsApp sessionIds are the user's phone number and are permanent, so
 * without this, "session expired, reinitializing" only reset the in-memory
 * expiry timer — the old messages row never went away, and the next
 * "fresh" message would silently pull the entire prior conversation back
 * into the Claude prompt via getConversationWithExpirationCheck().
 *
 * Messages are deleted (not just flagged) to keep behavior consistent with
 * deleteConversationData and saveConversation, which already treat
 * `messages` as the disposable, session-scoped table. The conversation row
 * itself is kept and stamped with when/why it was archived, so there's
 * still a lightweight audit trail without retaining old chat content.
 */
async function archiveExpiredConversation(sessionId) {
  try {
    await pool.query('DELETE FROM messages WHERE session_id = $1', [sessionId]);

    await pool.query(
      `UPDATE conversations
       SET metadata = jsonb_set(COALESCE(metadata, '{}'), '{expiredArchivedAt}', to_jsonb(NOW()::text)),
           updated_at = NOW()
       WHERE session_id = $1`,
      [sessionId]
    );

    return true;
  } catch (error) {
    console.error('Error archiving expired conversation:', error);
    // Non-fatal: worst case a stale message or two leaks into the next
    // prompt, same as today. Don't block the new session from starting.
    return false;
  }
}

module.exports = {
  getConversation,
  saveConversation,
  logMessage,
  logAnalytics,
  generateSessionId,
  clearExpiredSessions,
  deleteConversationData,
  archiveExpiredConversation,
};