const { getClaudeResponse, checkEscalationTriggers, detectSentiment } = require('../services/claudeService');
const { sanitizeForUser } = require('../utils/sanitizeResponse');
const {
  initializeSession,
  updateSessionActivity,
  checkSessionStatus,
  recoverSessionFromDB,
  getConversationWithExpirationCheck,
  endSessionInMemory,
} = require('../services/sessionManager');
const { getConversation, saveConversation, logMessage, logAnalytics, generateSessionId, deleteConversationData } = require('../services/conversationService');
const {
  buildChatResponse,
  buildSessionExpiredResponse,
  buildNewSessionResponse,
  buildEscalationResponse,
  buildErrorResponse,
} = require('../utils/responseBuilder');
const {
  searchFAQ,
  getRecommendation,
  findBranches,
  searchCompanyKnowledge,
  searchInsuranceProducts,   // ← now imported directly for standalone search
} = require('../services/policyService');
const { rankResults } = require('../utils/rankResults');

// Keywords that suggest the user wants branch / location info
const BRANCH_KEYWORDS = ['branch', 'office', 'location', 'near me', 'find', 'where', 'visit', 'address', 'directions'];

// Keywords that explicitly ask about products/coverage
const PRODUCT_KEYWORDS = ['product', 'cover', 'coverage', 'insure', 'insurance', 'policy', 'plan', 'benefit', 'offer', 'what do you'];

async function handleChat(req, res) {
  const startTime = Date.now();
  const { message, sessionId: providedSessionId } = req.body;

  let sessionId = providedSessionId;
  let isNewSession = false;

  try {
    // ── STEP 1: Session validation ─────────────────────────────────────────

    if (!sessionId) {
      sessionId = generateSessionId();
      isNewSession = true;
      await initializeSession(sessionId);
      console.log(`🆕 New session created: ${sessionId}`);
    } else {
      const sessionStatus = checkSessionStatus(sessionId);

      if (sessionStatus.isExpired) {
        const recovered = await recoverSessionFromDB(sessionId);

        if (recovered) {
          console.log(`♻️  Using recovered session: ${sessionId}`);
          await updateSessionActivity(sessionId);
        } else {
          console.log(`⏰ Session truly expired: ${sessionId} — starting new session`);

          await logAnalytics(sessionId, 'session_expired', {
            reason: 'inactivity_or_restart',
            timestamp: new Date().toISOString(),
          }).catch(() => {});

          sessionId = generateSessionId();
          isNewSession = true;
          await initializeSession(sessionId);
        }
      } else {
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
        sessionId,
        escalation: true,
        sentiment,
        session: {
          isActive: true,
          timeRemainingSeconds: Math.ceil(checkSessionStatus(sessionId).timeRemainingMs / 1000),
        },
        suggestions: ['Find a branch', 'Contact customer care', 'File a complaint'],
      });
    }

    // ── STEP 5: Parallel RAG retrieval ────────────────────────────────────
    // Run all searches in parallel. Insurance products are now fetched
    // independently (not only through getRecommendation) so generic
    // product-listing questions always populate contextData.products.

    const lowerMsg = message.toLowerCase();
    const wantsBranches = BRANCH_KEYWORDS.some(kw => lowerMsg.includes(kw));
    const wantsProducts = PRODUCT_KEYWORDS.some(kw => lowerMsg.includes(kw));

    console.log(`\n📨 [RAG] Incoming: "${message.substring(0, 80)}"`);
    console.log(`   branch intent : ${wantsBranches}`);
    console.log(`   product intent: ${wantsProducts}`);

    const [faqMatches, companyInfoMatches, recommendation, directProducts] = await Promise.all([
      searchFAQ(message, 5),
      searchCompanyKnowledge(message, 3),
      getRecommendation(message),
      // Always run a direct product search — getRecommendation wraps it too
      // but we want the raw array for contextData.products
      searchInsuranceProducts(message, 6),
    ]);

    // Branch search: run if user mentions location keywords
    let branches = [];
    if (wantsBranches) {
      const cityMatch = message.match(/(?:in|at|near|around)\s+(\w+)/i);
      branches = await findBranches(cityMatch ? cityMatch[1] : null);
    }

    // ── STEP 5b: Rank & assemble context ──────────────────────────────────

    const rankedFAQs    = rankResults(faqMatches, message).slice(0, 3);
    const rankedCompany = rankResults(companyInfoMatches, message).slice(0, 3);
    const rankedProducts = rankResults(directProducts, message).slice(0, 5);

    const contextData = {};

    if (rankedFAQs.length > 0) {
      contextData.faqContext = rankedFAQs.map(f => ({
        id: f.id, category: f.category, question: f.question,
        answer: f.answer, keywords: f.keywords, source_url: f.source_url,
      }));
    }

    if (rankedCompany.length > 0) {
      contextData.companyInfo = rankedCompany.map(row => ({
        id: row.id, section: row.section, title: row.title,
        content: row.content, tags: row.tags, source_url: row.source_url,
      }));
    }

    // Products: prefer the direct ranked list; fall back to recommendation object
    if (rankedProducts.length > 0) {
      contextData.products = rankedProducts.map(p => ({
        id: p.id, category: p.category, sub_category: p.sub_category,
        description: p.description, benefits: p.benefits, source_url: p.source_url,
      }));
    } else if (recommendation.matchedProducts.length > 0) {
      contextData.recommendations = recommendation;
    }

    if (branches.length > 0) {
      contextData.branches = branches.slice(0, 5).map(b => ({
        id: b.id, name: b.name, phone: b.phone, address: b.address,
        region: b.region, city: b.city, source_url: b.source_url,
      }));
    }

    const hasContext =
      (contextData.faqContext?.length > 0)     ||
      (contextData.companyInfo?.length > 0)    ||
      (contextData.products?.length > 0)       ||
      (contextData.recommendations?.matchedProducts?.length > 0) ||
      (contextData.branches?.length > 0);

    if (!hasContext) {
      contextData._noResults = true;
      console.log('⚠️  [RAG] No context retrieved for this message — AI will rely on system prompt only');
    } else {
      const counts = [
        contextData.faqContext?.length    && `faq:${contextData.faqContext.length}`,
        contextData.companyInfo?.length   && `knowledge:${contextData.companyInfo.length}`,
        contextData.products?.length      && `products:${contextData.products.length}`,
        contextData.branches?.length      && `branches:${contextData.branches.length}`,
      ].filter(Boolean);
      console.log(`✅ [RAG] Context assembled — ${counts.join(', ')}`);
    }

    // ── STEP 6: AI response ────────────────────────────────────────────────

    const rawAiResponse = await getClaudeResponse(message, history, contextData);

    // SECURITY: second, independent safety check at the controller
    // boundary — the actual line that persists to the DB and the line
    // that returns to the frontend. claudeService.getClaudeResponse()
    // already filters out raw model reasoning, but this is a deliberate
    // belt-and-suspenders check so a future code change upstream can
    // never silently let internal reasoning reach a user-facing response.
    const aiResponse = sanitizeForUser(rawAiResponse);

    if (!aiResponse) {
      console.error('❌ AI response failed final safety check (looked like internal reasoning) — refusing to forward it');
      return res.status(500).json(buildErrorResponse(new Error('unsafe_ai_response_blocked'), sessionId));
    }

    // ── STEP 7: Persist & respond ──────────────────────────────────────────

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

    const responsePayload = buildChatResponse({
      response: aiResponse,
      sessionId,
      sessionStatus: currentSessionStatus,
    });

    if (isNewSession && providedSessionId && providedSessionId !== sessionId) {
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

/**
 * POST /api/chat/end-session
 *
 * Called when the user explicitly confirms they want to end the
 * conversation from the frontend (e.g. clicking the X and confirming
 * the "End this conversation?" dialog).
 *
 * Unlike idle expiration (which is passive and recoverable), this is a
 * deliberate, user-initiated close: the session is dropped from the
 * in-memory active-sessions index immediately and the stored message
 * history for that session is wiped, so the next time the widget is
 * opened it starts a brand-new conversation.
 */
async function endSession(req, res) {
  const { sessionId } = req.body;

  try {
    if (!sessionId) {
      return res.status(400).json({ error: 'missing_session_id', message: 'sessionId is required' });
    }

    await logAnalytics(sessionId, 'session_ended_by_user', {
      timestamp: new Date().toISOString(),
    }).catch(() => {});

    await deleteConversationData(sessionId);
    endSessionInMemory(sessionId);

    return res.json({
      success: true,
      sessionId,
      message: 'Session ended and cleaned up successfully',
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Error ending session:', error);
    return res.status(500).json({ error: 'end_session_failed', message: 'Failed to end session' });
  }
}

module.exports = { handleChat, getConversationHistory, keepAliveSession, endSession };