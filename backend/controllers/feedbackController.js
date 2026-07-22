const feedbackService = require('../services/feedbackService');
const { logAnalytics } = require('../services/conversationService');

const VALID_RATINGS = ['up', 'down'];
const MAX_SNAPSHOT_LENGTH = 4000; // generous ceiling, just guards against abuse

/**
 * POST /api/chat/feedback
 * Body: { sessionId, messageId, rating: 'up' | 'down' | null, messageContent? }
 *
 * `rating: null` clears a previously-submitted rating (tapping the same
 * thumb twice = undo). Anything else must be 'up' or 'down'.
 */
async function submitFeedback(req, res, next) {
  try {
    const { sessionId, messageId, rating, messageRole, messageContent } = req.body;

    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'Validation Error', message: 'sessionId is required.' });
    }

    if (!messageId || typeof messageId !== 'string') {
      return res.status(400).json({ error: 'Validation Error', message: 'messageId is required.' });
    }

    if (rating === null) {
      await feedbackService.clearFeedback(sessionId, messageId);
      return res.json({ success: true, sessionId, messageId, rating: null });
    }

    if (!VALID_RATINGS.includes(rating)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: `rating must be one of: ${VALID_RATINGS.join(', ')}, or null to clear a previous rating.`,
      });
    }

    const trimmedContent =
      typeof messageContent === 'string' ? messageContent.slice(0, MAX_SNAPSHOT_LENGTH) : null;

    const feedback = await feedbackService.upsertFeedback({
      sessionId,
      messageId,
      rating,
      messageRole: messageRole === 'agent' ? 'agent' : 'assistant',
      messageContent: trimmedContent,
    });

    // Best-effort — mirrors how every other analytics event in this app
    // is logged (never blocks or fails the actual request).
    logAnalytics(sessionId, 'message_feedback', { messageId, rating }).catch(() => {});

    return res.json({
      success: true,
      sessionId,
      messageId,
      rating: feedback.rating,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = { submitFeedback };
