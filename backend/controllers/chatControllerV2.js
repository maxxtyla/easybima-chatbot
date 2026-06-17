const { getClaudeResponse, checkEscalationTriggers, detectSentiment } = require('../services/claudeService');
const {
  initializeSession,
  updateSessionActivity,
  checkSessionStatus,
  recoverSessionFromDB,           // ← new import
  getConversationWithExpirationCheck,
} = require('../services/sessionManager');
const { getConversation, saveConversation, logMessage, logAnalytics, generateSessionId } = require('../services/conversationService');
const {
  buildChatResponse,
  buildSessionExpiredResponse,
  buildNewSessionResponse,
  buildEscalationResponse,
  buildErrorResponse,
} = require('../utils/responseBuilder');
const { searchFAQ, getRecommendation, findBranches, searchCompanyKnowledge } = require('../services/policyService');

async function handleChat(req, res) {
  const startTime = Date.now();
  const { message, sessionId: providedSessionId } = req.body;

  let sessionId = providedSessionId;
  let isNewSession = false;

  try {
    // ── STEP 1: Session validation ─────────────────────────────────────────

    if (!sessionId) {
      // No session ID provided — create one fresh
      sessionId = generateSessionId();
      isNewSession = true;
      await initializeSession(sessionId);
      console.log(`🆕 New session created: ${sessionId}`);

    } else {
      // Session ID provided — check memory first
      const sessionStatus = checkSessionStatus(sessionId);

      if (sessionStatus.isExpired) {
        // FIX B — Try to recover from DB before declaring it expired.
        // This handles server restarts where the in-memory Map was wiped
        // even though the session is still valid in PostgreSQL.
        const recovered = await recoverSessionFromDB(sessionId);

        if (recovered) {
          // Session is valid — just update its activity timer and continue
          console.log(`♻️  Using recovered session: ${sessionId}`);
          await updateSessionActivity(sessionId);
        } else {
          // Session is genuinely gone/expired — start fresh but DON'T stop here.
          // FIX C — old code did `return res.json(buildSessionExpiredResponse(null))`
          // which sent null as the sessionId so the frontend never knew the new ID,
          // causing it to keep sending the old (dead) ID on every subsequent request.
          console.log(`⏰ Session truly expired: ${sessionId} — starting new session`);

          await logAnalytics(sessionId, 'session_expired', {
            reason: 'inactivity_or_restart',
            timestamp: new Date().toISOString(),
          }).catch(() => {}); // don't let analytics failure block the chat

          // Create new session
          sessionId = generateSessionId();
          isNewSession = true;
          await initializeSession(sessionId);
          // Fall through — answer the message in the new session below
        }
      } else {
        // Session active — reset the expiry timer
        await updateSessionActivity(sessionId);
      }
    }

    // ── STEP 2: Conversation history ───────────────────────────────────────

    const conversation = await getConversationWithExpirationCheck(sessionId);
    const history = conversation.messages || [];

    // ── STEP 3: Log user message ───────────────────────────────────────────

    await logMessage(sessionId, 'user', message, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      isNewSession,
      timestamp: new Date().toISOString(),
    });

    // ── STEP 4: Escalation & sentiment check ──────────────────────────────

    const needsEscalation = checkEscalationTriggers(message);
    const sentiment = detectSentiment(message);

    if (needsEscalation || sentiment === 'angry') {
      await logAnalytics(sessionId, 'escalation_requested', {
        trigger: needsEscalation ? 'keyword' : 'sentiment',
        sentiment,
        message: message.substring(0, 100),
      }).catch(() => {});

      return res.json({
        ...buildEscalationResponse(),
        sessionId,                // ← always return current sessionId
        escalation: true,
        sentiment,
        session: {
          isActive: true,
          timeRemainingSeconds: Math.ceil(checkSessionStatus(sessionId).timeRemainingMs / 1000),
        },
        suggestions: ['Find a branch', 'Contact customer care', 'File a complaint'],
      });
    }

    // ── STEP 5: Enrich context & get AI response ──────────────────────────

    const contextData = {};

    const [faqMatches, companyInfoMatches, recommendation] = await Promise.all([
      searchFAQ(message, 3),
      searchCompanyKnowledge(message, 3),
      getRecommendation(message),
    ]);

    if (faqMatches.length > 0) {
      contextData.faqContext = faqMatches.map(f => ({
        id: f.id, category: f.category, question: f.question,
        answer: f.answer, keywords: f.keywords, source_url: f.source_url,
      }));
    }

    if (companyInfoMatches.length > 0) {
      contextData.companyInfo = companyInfoMatches.map(row => ({
        id: row.id, section: row.section, title: row.title,
        content: row.content, tags: row.tags, source_url: row.source_url,
      }));
    }

    if (recommendation.matchedProducts.length > 0) {
      contextData.recommendations = recommendation;
    }

    const branchKeywords = ['branch', 'office', 'location', 'near me', 'find', 'where'];
    if (branchKeywords.some(kw => message.toLowerCase().includes(kw))) {
      const cityMatch = message.match(/(?:in|at|near|around)\s+(\w+)/i);
      const branches = await findBranches(cityMatch ? cityMatch[1] : null);
      if (branches.length > 0) {
        contextData.branches = branches.slice(0, 3).map(b => ({
          id: b.id, name: b.name, phone: b.phone, address: b.address,
          region: b.region, city: b.city, source_url: b.source_url,
        }));
      }
    }

    const aiResponse = await getClaudeResponse(message, history, contextData);

    // ── STEP 6: Persist & respond ──────────────────────────────────────────

    const updatedHistory = [
      ...history,
      { role: 'user',      content: message },
      { role: 'assistant', content: aiResponse },
    ];

    await saveConversation(sessionId, updatedHistory);

    await logMessage(sessionId, 'assistant', aiResponse, {
      processingTimeMs: Date.now() - startTime,
    });

    const currentSessionStatus = checkSessionStatus(sessionId);

    // FIX D — if the session was expired and we made a new one, tell the
    // frontend about the new sessionId so it stops re-sending the old dead one.
    const responsePayload = buildChatResponse({
      response: aiResponse,
      sessionId,                  // ← new sessionId if session was renewed
      sessionStatus: currentSessionStatus,
    });

    if (isNewSession && providedSessionId && providedSessionId !== sessionId) {
      // Signal to the frontend that the sessionId changed
      responsePayload.sessionRenewed = true;
    }

    return res.json(responsePayload);

  } catch (error) {
    console.error('❌ Chat handler error:', error);

    if (sessionId) {
      logAnalytics(sessionId, 'error_occurred', {
        error: error.message,
        timestamp: new Date().toISOString(),
      }).catch(() => {});
    }

    return res.status(500).json(buildErrorResponse(error, sessionId));
  }
}

async function getConversationHistory(req, res) {
  const { sessionId } = req.params;

  try {
    if (!sessionId) {
      return res.status(400).json({ error: 'missing_session_id', message: 'sessionId is required' });
    }

    let sessionStatus = checkSessionStatus(sessionId);

    // Try DB recovery before 410-ing
    if (sessionStatus.isExpired) {
      const recovered = await recoverSessionFromDB(sessionId);
      if (recovered) {
        sessionStatus = checkSessionStatus(sessionId);
      } else {
        return res.status(410).json({ error: 'session_expired', message: 'This conversation session has expired' });
      }
    }

    const conversation = await getConversationWithExpirationCheck(sessionId);

    return res.json({
      sessionId,
      messages: conversation.messages,
      isActive: sessionStatus.isActive,
      timeRemainingSeconds: Math.ceil(sessionStatus.timeRemainingMs / 1000),
      createdAt: conversation.createdAt,
      lastActivityAt: conversation.lastActivityAt,
    });

  } catch (error) {
    console.error('Error fetching conversation:', error);
    return res.status(500).json(buildErrorResponse(error, sessionId));
  }
}

async function keepAliveSession(req, res) {
  const { sessionId } = req.body;

  try {
    if (!sessionId) {
      return res.status(400).json({ error: 'missing_session_id', message: 'sessionId is required' });
    }

    let sessionStatus = checkSessionStatus(sessionId);

    if (sessionStatus.isExpired) {
      const recovered = await recoverSessionFromDB(sessionId);
      if (!recovered) {
        return res.status(410).json(buildSessionExpiredResponse(sessionId));
      }
      sessionStatus = checkSessionStatus(sessionId);
    }

    await updateSessionActivity(sessionId);
    const updatedStatus = checkSessionStatus(sessionId);

    return res.json({
      success: true,
      sessionId,
      message: 'Session keep-alive successful',
      timeRemainingSeconds: Math.ceil(updatedStatus.timeRemainingMs / 1000),
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Error in keep-alive:', error);
    return res.status(500).json({ error: 'keep_alive_failed', message: 'Failed to keep session alive' });
  }
}

module.exports = { handleChat, getConversationHistory, keepAliveSession };