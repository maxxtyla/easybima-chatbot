const { pool } = require('../config/database');

/**
 * Create or update a customer's 👍/👎 rating on a specific bot reply.
 *
 * Upserts on (session_id, message_id) so re-rating the same message (e.g.
 * the customer taps 👎 then changes their mind to 👍) updates the one row
 * instead of piling up duplicates. `message_content` is snapshotted at
 * write time — see the migration file for why this table doesn't rely on
 * joining back to the `messages` table.
 */
async function upsertFeedback({ sessionId, messageId, rating, messageRole = 'assistant', messageContent = null }) {
  const result = await pool.query(
    `INSERT INTO message_feedback (session_id, message_id, rating, message_role, message_content)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (session_id, message_id)
     DO UPDATE SET
       rating = EXCLUDED.rating,
       message_content = COALESCE(EXCLUDED.message_content, message_feedback.message_content),
       updated_at = NOW()
     RETURNING id, session_id, message_id, rating, created_at, updated_at`,
    [sessionId, messageId, rating, messageRole, messageContent]
  );

  return result.rows[0];
}

/**
 * Removes a previously-submitted rating — used when the customer taps the
 * same thumb again to undo their feedback.
 */
async function clearFeedback(sessionId, messageId) {
  await pool.query(
    'DELETE FROM message_feedback WHERE session_id = $1 AND message_id = $2',
    [sessionId, messageId]
  );
  return true;
}

module.exports = {
  upsertFeedback,
  clearFeedback,
};
