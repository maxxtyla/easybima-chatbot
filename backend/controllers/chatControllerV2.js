const { getClaudeResponse, checkEscalationTriggers, detectSentiment } = require('../services/claudeService');
const {
  initializeSession,
  updateSessionActivity,
  checkSessionStatus,
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
/**
 * NEW - Enhanced chat handler with session expiration management
 * 
 * Flow:
 * 1. Check if session exists and is active
 * 2. If expired or doesn't exist, create new one
 * 3. Update activity timestamp
 * 4. Check for pre-expiration warning
 * 5. Process message and get response
 * 6. Return response with session status
 */
async function handleChat(req, res) {
  const startTime = Date.now();
  const { message, sessionId: providedSessionId } = req.body;

  let sessionId = providedSessionId;
  let isNewSession = false;

  try {
    // ===== STEP 1: Session Validation & Creation =====
    
    if (!sessionId) {
      // Client didn't provide session ID - create new one
      sessionId = generateSessionId();
      isNewSession = true;
      await initializeSession(sessionId);
      console.log(`🆕 New session created: ${sessionId}`);
    } else {
      // Check if existing session is expired
      const sessionStatus = checkSessionStatus(sessionId);
      
      if (sessionStatus.isExpired) {
        // Session expired - create new one but inform user
        console.log(`⏰ Session expired: ${sessionId}`);
        
        // Log the expiration event
        await logAnalytics(sessionId, 'session_expired', {
          reason: 'inactivity',
          durationMs: Date.now() - sessionStatus.expiryTime,
        });

        // Create new session
        sessionId = generateSessionId();
        isNewSession = true;
        await initializeSession(sessionId);

        return res.json(buildSessionExpiredResponse(null));
      } else {
        // Session is active - reset the expiry timer
        await updateSessionActivity(sessionId);
      }
    }

    // ===== STEP 2: Get Conversation History =====
    
    const conversation = await getConversationWithExpirationCheck(sessionId);
    
    if (conversation.isExpired) {
      return res.json(buildSessionExpiredResponse(sessionId));
    }

    const history = conversation.messages || [];

    // ===== STEP 3: Log User Message =====
    
    await logMessage(sessionId, 'user', message, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      isNewSession,
      timestamp: new Date().toISOString(),
    });

    // ===== STEP 4: Check Escalation & Sentiment =====
    
    const needsEscalation = checkEscalationTriggers(message);
    const sentiment = detectSentiment(message);

    if (needsEscalation || sentiment === 'angry') {
      await logAnalytics(sessionId, 'escalation_requested', {
        trigger: needsEscalation ? 'keyword' : 'sentiment',
        sentiment,
        message: message.substring(0, 100),
      });

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

    // ===== STEP 5: Enrich Context & Get AI Response =====
    
    let enrichedMessage = message;
    const contextData = {};

    const faqMatches = await searchFAQ(message, 3);
    if (faqMatches.length > 0) {
      contextData.faqContext = faqMatches.map(f => ({
        id: f.id,
        category: f.category,
        question: f.question,
        answer: f.answer,
        keywords: f.keywords,
        source_url: f.source_url,
      }));
    }

    const companyInfoMatches = await searchCompanyKnowledge(message, 3);
    if (companyInfoMatches.length > 0) {
      contextData.companyInfo = companyInfoMatches.map(row => ({
        id: row.id,
        section: row.section,
        title: row.title,
        content: row.content,
        tags: row.tags,
        source_url: row.source_url,
      }));
    }
    const recommendation = await getRecommendation(message);
    if (recommendation.matchedProducts.length > 0) {
      contextData.recommendations = recommendation;
    }

    const branchKeywords = ['branch', 'office', 'location', 'near me', 'find', 'where'];
    if (branchKeywords.some(kw => message.toLowerCase().includes(kw))) {
      const cityMatch = message.match(/(?:in|at|near|around)\s+(\w+)/i);
      const city = cityMatch ? cityMatch[1] : null;
      const branches = await findBranches(city);
      if (branches.length > 0) {
        contextData.branches = branches.slice(0, 3).map(b => ({
          id: b.id,
          name: b.name,
          phone: b.phone,
          address: b.address,
          region: b.region,
          city: b.city,
          source_url: b.source_url,
        }));
      }
    }

    // Get AI response
const aiResponse = await getClaudeResponse(enrichedMessage, history, contextData);
    // ===== STEP 6: Save Conversation & Build Response =====
    
    const updatedHistory = [...history, { role: 'user', content: message }];

    await saveConversation(sessionId, [
      ...updatedHistory,
      { role: 'assistant', content: aiResponse },
    ]);

    await logMessage(sessionId, 'assistant', aiResponse, {
      processingTimeMs: Date.now() - startTime,
    });

    // Get current session status for response
    const currentSessionStatus = checkSessionStatus(sessionId);

    // Build response with session status and optional warning
    return res.json(
      buildChatResponse({
        response: aiResponse,
        sessionId,
        sessionStatus: currentSessionStatus,
      })
    );

  } catch (error) {
    console.error('❌ Chat handler error:', error);

    // Log error event
    if (sessionId) {
      try {
        await logAnalytics(sessionId, 'error_occurred', {
          error: error.message,
          stack: error.stack,
          timestamp: new Date().toISOString(),
        });
      } catch (logError) {
        console.error('Failed to log error:', logError);
      }
    }

    return res.status(500).json(buildErrorResponse(error, sessionId));
  }
}

/**
 * Get conversation history endpoint
 * Respects session expiration
 */
async function getConversationHistory(req, res) {
  const { sessionId } = req.params;

  try {
    if (!sessionId) {
      return res.status(400).json({
        error: 'missing_session_id',
        message: 'sessionId is required',
      });
    }

    const sessionStatus = checkSessionStatus(sessionId);

    if (sessionStatus.isExpired) {
      return res.status(410).json({
        error: 'session_expired',
        message: 'This conversation session has expired',
      });
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

/**
 * Keep-alive endpoint
 * Resets inactivity timer without sending a message
 * Optional but useful for keeping sessions alive
 */
async function keepAliveSession(req, res) {
  const { sessionId } = req.body;

  try {
    if (!sessionId) {
      return res.status(400).json({
        error: 'missing_session_id',
        message: 'sessionId is required',
      });
    }

    const sessionStatus = checkSessionStatus(sessionId);

    if (sessionStatus.isExpired) {
      return res.status(410).json(buildSessionExpiredResponse(sessionId));
    }

    // Reset the timer
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
    return res.status(500).json({
      error: 'keep_alive_failed',
      message: 'Failed to keep session alive',
    });
  }
}

module.exports = {
  handleChat,
  getConversationHistory,
  keepAliveSession,
};
