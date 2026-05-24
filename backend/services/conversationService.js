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

module.exports = {
  getConversation,
  saveConversation,
  logMessage,
  logAnalytics,
  generateSessionId,
  clearExpiredSessions,
};