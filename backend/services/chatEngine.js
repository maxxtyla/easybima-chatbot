//
// Channel-agnostic chat pipeline. This is the single source of truth for
// "take a user message + sessionId, run RAG retrieval, call Claude, persist,
// return a reply" — used by BOTH the web widget (chatControllerV2 -> REST
// JSON) and WhatsApp (whatsappController -> Twilio TwiML).
//
// Splitting this out means the two channels can never silently drift apart
// in escalation logic, RAG retrieval, or safety checks (sanitizeForUser).
// Any future channel (e.g. an Expo mobile app) plugs in here the same way.

const { getClaudeResponse, checkEscalationTriggers, detectSentiment } = require('./claudeService');
const { sanitizeForUser } = require('../utils/sanitizeResponse');
const {
  initializeSession,
  updateSessionActivity,
  checkSessionStatus,
  recoverSessionFromDB,
  getConversationWithExpirationCheck,
} = require('./sessionManager');
const {
  logMessage,
  logAnalytics,
  generateSessionId,
  saveConversation,
  archiveExpiredConversation,
} = require('./conversationService');
const { buildEscalationResponse } = require('../utils/responseBuilder');
const { createTicket, isSessionHandedOff, hasOpenTicket, getActiveTicketWithAgent } = require('./ticketService');
const {
  searchFAQ,
  getRecommendation,
  findBranches,
  searchCompanyKnowledge,
  searchInsuranceProducts,
  searchClaims,
} = require('./policyService');
const { rankResults } = require('../utils/rankResults');
const { classifyIntent } = require('../utils/intentRouter');

/**
 * Core pipeline. Channel-specific controllers call this and then format
 * the result however their transport needs (JSON for web, TwiML for
 * WhatsApp).
 *
 * @param {Object} params
 * @param {string} params.message - raw user text
 * @param {string} [params.sessionId] - existing session id. If omitted, a
 *   new random one is generated (web widget behaviour). WhatsApp always
 *   passes a deterministic id (the `whatsapp:+E164` string from Twilio).
 * @param {Object} [params.meta] - channel metadata for logging, e.g.
 *   { channel: 'web' | 'whatsapp', ip, userAgent }
 * @returns {Promise<Object>} result — see shape below
 */
async function processMessage({ message, sessionId: providedSessionId, meta = {} }) {
  const startTime = Date.now();
  let sessionId = providedSessionId;
  let isNewSession = false;

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
        console.log(`⏰ Session truly expired or new: ${sessionId} — (re)initializing`);

        await logAnalytics(sessionId, 'session_expired', {
          reason: 'inactivity_or_restart',
          timestamp: new Date().toISOString(),
        }).catch(() => {});

        // IMPORTANT: sessionId is permanent for WhatsApp (it's the phone
        // number), so a "truly expired" session must actually clear its old
        // message rows here — otherwise initializeSession() below only
        // resets the in-memory expiry timer, and the very next
        // getConversationWithExpirationCheck() call still pulls the entire
        // prior conversation back in, defeating the point of expiry.
        await archiveExpiredConversation(sessionId).catch(() => {});

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
    channel: meta.channel || 'web',
    ip: meta.ip,
    userAgent: meta.userAgent,
    isNewSession,
    timestamp: new Date().toISOString(),
  });

  // ── STEP 3.5: Human handoff / open-ticket check ────────────────────────
  // If an agent has already taken over this session's ticket, OR a ticket
  // already exists and simply hasn't been picked up yet, the bot goes
  // silent from here on: the customer's message is still logged above so
  // the agent sees it live in the ticket transcript, but we skip
  // escalation/RAG/Claude entirely and hand control back to the caller
  // (chatControllerV2 / whatsappController) to not send a bot reply.
  //
  // BUG FIX: this used to only check isSessionHandedOff (human_handled =
  // true), so any follow-up message sent between "ticket created" and "an
  // agent actually replies" fell through to the normal AI pipeline and
  // got an unrelated fresh bot answer — talking over an escalation that
  // was already in progress. Checking hasOpenTicket as well closes that
  // gap: once a ticket exists, the bot stays quiet and waits.
  const handedOff = (await isSessionHandedOff(sessionId)) || (await hasOpenTicket(sessionId));
  if (handedOff) {
    await logAnalytics(sessionId, 'human_handled_message', {
      timestamp: new Date().toISOString(),
    }).catch(() => {});

    // Get agent details for the active ticket
    const activeTicket = await getActiveTicketWithAgent(sessionId);
    const assignedAgent = activeTicket && activeTicket.assigned_to 
      ? { id: activeTicket.assigned_to, name: activeTicket.assigned_agent_name }
      : null;

    return {
      sessionId,
      aiResponse: null,
      isNewSession,
      escalation: false,
      humanHandled: true,
      sentiment: null,
      ticketNumber: activeTicket?.ticket_number || null,
      ticketStatus: activeTicket?.status || 'open',
      ticketCreatedAt: activeTicket?.created_at?.toISOString() || null,
      assignedAgent,
      sessionStatus: checkSessionStatus(sessionId),
    };
  }

  // ── STEP 4: Escalation & sentiment check ──────────────────────────────
  const needsEscalation = checkEscalationTriggers(message);
  const sentiment = detectSentiment(message);
console.log(`🚨 [Escalation check] "${message}" → needsEscalation=${needsEscalation}, sentiment=${sentiment}`);

  if (needsEscalation || sentiment === 'angry') {
    await logAnalytics(sessionId, 'escalation_requested', {
      trigger: needsEscalation ? 'keyword' : 'sentiment',
      sentiment,
      message: message.substring(0, 100),
    }).catch(() => {});

    const escalation = buildEscalationResponse();

    // Turn the escalation into something a human agent can actually act
    // on, instead of just telling the customer to call in. Ticket
    // creation failures must never block the chat reply itself — the
    // customer still gets CIC's phone/email either way, they just won't
    // get a reference number if this fails.
    let ticketNumber = null;
    try {
      const channel = meta.channel === 'whatsapp' ? 'whatsapp' : 'web';
      const customerPhone = channel === 'whatsapp' ? sessionId.replace(/^whatsapp:/, '') : null;

      const ticket = await createTicket({
        sessionId,
        channel,
        triggerMessage: message,
        sentiment,
        source: needsEscalation ? 'user_requested' : 'auto_escalation',
        customerPhone,
        customerName: meta.profileName || null,
      });
      ticketNumber = ticket.ticket_number;
      console.log(`✅ [TICKET] Created successfully: ${ticketNumber}`);
    } catch (ticketError) {
      console.error('❌ [TICKET] Failed to create ticket for escalation:');
      console.error('   Error message:', ticketError.message);
      console.error('   Error code:', ticketError.code);
      console.error('   Stack trace:', ticketError.stack);
    }

    const escalationResponse = ticketNumber
      ? `${escalation.response}\n\nYour reference number is *${ticketNumber}* — please quote this when you contact us.`
      : escalation.response;

    // Persist the escalation reply too, so history stays consistent
    // across channels and a follow-up message has the right context.
    const updatedHistory = [
      ...history,
      { role: 'user', content: message },
      { role: 'assistant', content: escalationResponse },
    ];
    await logMessage(sessionId, 'assistant', escalationResponse, {
      processingTimeMs: Date.now() - startTime,
      escalation: true,
      ticketNumber,
    });

    return {
      sessionId,
      aiResponse: escalationResponse,
      isNewSession,
      escalation: true,
      ticketNumber,
      ticketStatus: 'open',
      ticketCreatedAt: new Date().toISOString(),
      sentiment,
      sessionStatus: checkSessionStatus(sessionId),
      suggestions: ['Find a branch', 'Contact customer care', 'File a complaint'],
    };
  }

  // ── STEP 5: Intent-routed RAG retrieval ────────────────────────────────
  // Instead of querying every table on every message, we extract keywords
  // and classify intent first, then only hit the tables that are actually
  // relevant. This cuts DB load and reduces irrelevant context being
  // stuffed into the Claude prompt.
  const intent = await classifyIntent(message);

  console.log(`\n📨 [RAG/${meta.channel || 'web'}] Incoming: "${message.substring(0, 80)}"`);
  console.log(`   keywords      : [${intent.keywords.join(', ') || 'none'}]`);
  console.log(`   faq intent    : ${intent.wantsFAQ}`);
  console.log(`   product intent: ${intent.wantsProducts}`);
  console.log(`   branch intent : ${intent.wantsBranches}`);
  console.log(`   company intent: ${intent.wantsCompanyInfo}`);
  console.log(`   claims intent : ${intent.wantsClaims}`);

  // Build only the queries we actually need, run them in parallel, then
  // map results back by label (avoids fragile positional destructuring
  // now that the query list length varies per message).
  const jobs = [];

  if (intent.wantsFAQ) {
    jobs.push(['faq', searchFAQ(message, 5)]);
  }
  if (intent.wantsCompanyInfo) {
    jobs.push(['company', searchCompanyKnowledge(message, 3)]);
  }
  if (intent.wantsProducts) {
    jobs.push(['products', searchInsuranceProducts(message, 6)]);
    jobs.push(['recommendation', getRecommendation(message)]);
  }
  if (intent.wantsClaims) {
    jobs.push(['claims', searchClaims(message, 5)]);
  }

  const settled = await Promise.all(jobs.map(([, promise]) => promise));
  const resultsByLabel = Object.fromEntries(jobs.map(([label], i) => [label, settled[i]]));

  const faqMatches = resultsByLabel.faq || [];
  const companyInfoMatches = resultsByLabel.company || [];
  const directProducts = resultsByLabel.products || [];
  const recommendation = resultsByLabel.recommendation || { matchedProducts: [] };
  const claimsMatches = resultsByLabel.claims || [];

  let branches = [];
  if (intent.wantsBranches) {
    branches = await findBranches(message, intent.cityHint);
  }

  // ── STEP 5b: Rank & assemble context ──────────────────────────────────
  const rankedFAQs = rankResults(faqMatches, message).slice(0, 3);
  const rankedCompany = rankResults(companyInfoMatches, message).slice(0, 3);
  const rankedProducts = rankResults(directProducts, message).slice(0, 5);
  const rankedBranches = rankResults(branches, message).slice(0, 5);
  const rankedClaims = rankResults(claimsMatches, message).slice(0, 5);

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

  if (rankedProducts.length > 0) {
    contextData.products = rankedProducts.map(p => ({
      id: p.id, category: p.category, sub_category: p.sub_category,
      description: p.description, benefits: p.benefits, source_url: p.source_url,
    }));
  } else if (recommendation.matchedProducts.length > 0) {
    contextData.recommendations = recommendation;
  }

  if (branches.length > 0) {
    const branchesForContext = rankedBranches.length > 0 ? rankedBranches : branches.slice(0, 5);
    contextData.branches = branchesForContext.map(b => ({
      id: b.id, name: b.name, phone: b.phone, address: b.address,
      region: b.region, city: b.city, source_url: b.source_url,
    }));
  }

  if (rankedClaims.length > 0) {
    contextData.claimsInfo = rankedClaims.map(c => ({
      id: c.id, name: c.name, category: c.category, subcategory: c.subcategory,
      description: c.description, keywords: c.keywords, source_url: c.source_url,
    }));
  }

  const hasContext =
    (contextData.faqContext?.length > 0) ||
    (contextData.companyInfo?.length > 0) ||
    (contextData.products?.length > 0) ||
    (contextData.recommendations?.matchedProducts?.length > 0) ||
    (contextData.branches?.length > 0) ||
    (contextData.claimsInfo?.length > 0);

  if (!hasContext) {
    contextData._noResults = true;
    console.log('⚠️  [RAG] No context retrieved for this message — AI will rely on system prompt only');
  } else {
    const counts = [
      contextData.faqContext?.length && `faq:${contextData.faqContext.length}`,
      contextData.companyInfo?.length && `knowledge:${contextData.companyInfo.length}`,
      contextData.products?.length && `products:${contextData.products.length}`,
      contextData.branches?.length && `branches:${contextData.branches.length}`,
      contextData.claimsInfo?.length && `claims:${contextData.claimsInfo.length}`,
    ].filter(Boolean);
    console.log(`✅ [RAG] Context assembled — ${counts.join(', ')}`);
  }

  // ── STEP 6: AI response ────────────────────────────────────────────────
  // History can contain role='agent' rows from a since-closed handoff
  // (see STEP 3.5) — OpenRouter only accepts user/assistant/system, so map
  // those to 'assistant' for the LLM call only. The raw `history` (with
  // the real 'agent' role intact) is still what gets persisted below and
  // returned to callers, so the ticket transcript stays accurate.
  const historyForLLM = history.map(msg =>
    msg.role === 'agent' ? { ...msg, role: 'assistant' } : msg
  );
  const rawAiResponse = await getClaudeResponse(message, historyForLLM, contextData);
  const aiResponse = sanitizeForUser(rawAiResponse);

  if (!aiResponse) {
    console.error('❌ AI response failed final safety check (looked like internal reasoning) — refusing to forward it');
    const err = new Error('unsafe_ai_response_blocked');
    err.sessionId = sessionId;
    throw err;
  }

  // ── STEP 7: Persist & return ────────────────────────────────────────────
  const updatedHistory = [
    ...history,
    { role: 'user', content: message },
    { role: 'assistant', content: aiResponse },
  ];

  await saveConversation(sessionId, updatedHistory);

  await logMessage(sessionId, 'assistant', aiResponse, {
    processingTimeMs: Date.now() - startTime,
  });

  return {
    sessionId,
    aiResponse,
    isNewSession,
    escalation: false,
    sentiment,
    sessionStatus: checkSessionStatus(sessionId),
  };
}

module.exports = { processMessage };