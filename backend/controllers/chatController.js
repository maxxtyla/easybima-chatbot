const { getClaudeResponse, checkEscalationTriggers, detectSentiment } = require('../services/claudeService');
const { getConversation, saveConversation, logMessage, logAnalytics, generateSessionId } = require('../services/conversationService');
const { searchFAQ, getRecommendation, findBranches, getQuickFact } = require('../services/policyService');

/**
 * Main chat handler - orchestrates the entire chat flow
 */
async function handleChat(req, res) {
  const startTime = Date.now();
  const { message, sessionId: providedSessionId } = req.body;

  let sessionId = providedSessionId;
  let isNewSession = false;

  try {
    // Generate or validate session ID
    if (!sessionId) {
      sessionId = generateSessionId();
      isNewSession = true;
      console.log(`🆕 New session created: ${sessionId}`);
    }

    // Get conversation history
    const conversation = await getConversation(sessionId);
    const history = conversation.messages || [];

    if (conversation.wasExpired) {
      sessionId = conversation.sessionId; // Use new session ID
      isNewSession = true;
    }

    // Log user message
    await logMessage(sessionId, 'user', message, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      isNewSession,
    });

    // Check for escalation triggers
    const needsEscalation = checkEscalationTriggers(message);
    const sentiment = detectSentiment(message);

    if (needsEscalation || sentiment === 'angry') {
      await logAnalytics(sessionId, 'escalation_requested', {
        trigger: needsEscalation ? 'keyword' : 'sentiment',
        sentiment,
        message: message.substring(0, 100),
      });

      return res.json({
        response: generateEscalationResponse(),
        sessionId,
        escalation: true,
        sentiment,
        timestamp: new Date().toISOString(),
        suggestions: ['Find a branch', 'Contact customer care', 'File a complaint'],
      });
    }

    // Enrich context with policy data if relevant
    let enrichedMessage = message;
    const contextData = {};

    // Check for FAQ matches
    const faqMatches = await searchFAQ(message, 2);
    if (faqMatches.length > 0) {
      contextData.faqContext = faqMatches.map(f => ({
        question: f.question,
        answer: f.answer,
      }));
    }

    // Check for product recommendations
    const recommendation = await getRecommendation(message);
    if (recommendation.matchedProducts.length > 0) {
      contextData.recommendations = recommendation;
    }

    // Check for branch queries
    const branchKeywords = ['branch', 'office', 'location', 'near me', 'find', 'where'];
    if (branchKeywords.some(kw => message.toLowerCase().includes(kw))) {
      const cityMatch = message.match(/(?:in|at|near|around)\s+(\w+)/i);
      const city = cityMatch ? cityMatch[1] : null;
      const branches = await findBranches(city);
      if (branches.length > 0) {
        contextData.branches = branches.slice(0, 3);
      }
    }

    // Build context prompt if we have relevant data
    if (Object.keys(contextData).length > 0) {
      enrichedMessage = buildContextPrompt(message, contextData);
    }

    // Get AI response
    const aiResponse = await getClaudeResponse(enrichedMessage, history);

    // Save conversation
    const updatedHistory = [
      ...history,
      { role: 'user', content: message, timestamp: new Date().toISOString() },
      { role: 'assistant', content: aiResponse, timestamp: new Date().toISOString() },
    ];

    await saveConversation(sessionId, updatedHistory, {
      messageCount: updatedHistory.length,
      lastSentiment: sentiment,
    });

    // Log assistant response
    await logMessage(sessionId, 'assistant', aiResponse, {
      responseTime: Date.now() - startTime,
      model: process.env.CLAUDE_MODEL || 'claude-3-sonnet-20240229',
    });

    // Generate suggestions based on conversation context
    const suggestions = generateSuggestions(message, aiResponse, contextData);

    const responseTime = Date.now() - startTime;
    console.log(`✅ Chat handled in ${responseTime}ms | Session: ${sessionId}`);

    res.json({
      response: aiResponse,
      sessionId,
      escalation: false,
      sentiment,
      suggestions,
      timestamp: new Date().toISOString(),
      responseTime,
    });

  } catch (error) {
    console.error('❌ Chat controller error:', error);

    await logAnalytics(providedSessionId || 'unknown', 'error_occurred', {
      error: error.message,
      stack: error.stack,
    });

    // Return graceful error response
    res.status(500).json({
      response: `I apologize, but I'm having trouble processing your request right now. Please try again in a moment, or contact our customer care team at +254 20 2823000 for immediate assistance.`,
      sessionId: providedSessionId || generateSessionId(),
      escalation: true,
      error: true,
      timestamp: new Date().toISOString(),
      suggestions: ['Contact customer care', 'Try again', 'Find a branch'],
    });
  }
}

/**
 * Build context prompt with relevant policy data
 */
function buildContextPrompt(userMessage, contextData) {
  let context = '';

  if (contextData.faqContext) {
    context += `

RELEVANT FAQ INFORMATION:
`;
    contextData.faqContext.forEach((faq, i) => {
      context += `${i + 1}. Q: ${faq.question}
   A: ${faq.answer}
`;
    });
  }

  if (contextData.recommendations) {
    context += `

PRODUCT RECOMMENDATIONS:
`;
    context += `${contextData.recommendations.suggestion}
`;
    contextData.recommendations.matchedProducts.forEach((product, i) => {
      context += `${i + 1}. ${product.name}: ${product.description}
`;
      if (product.key_features) {
        const features = Array.isArray(product.key_features) 
          ? product.key_features 
          : JSON.parse(product.key_features);
        context += `   Key features: ${features.join(', ')}
`;
      }
    });
  }

  if (contextData.branches) {
    context += `

RELEVANT BRANCHES:
`;
    contextData.branches.forEach((branch, i) => {
      context += `${i + 1}. ${branch.name} - ${branch.address}, ${branch.city}
`;
      context += `   Phone: ${branch.phone}
`;
    });
  }

  return `${userMessage}

[SYSTEM CONTEXT - Use this information to provide accurate, helpful responses]:${context}

Please respond naturally using the context above where relevant.`;
}

/**
 * Generate escalation response
 */
function generateEscalationResponse() {
  return `I understand you'd like to speak with a human agent. I'm connecting you right away.

You can reach our customer care team through:

📞 **Phone**: +254 20 2823000
   Monday-Friday: 8:00 AM - 5:00 PM
   Saturday: 9:00 AM - 1:00 PM

📧 **Email**: customerservice@cicinsurancegroup.com

🏢 **Visit any branch**: We have 25+ branches across Kenya
   • Nairobi: Upper Hill (HQ), CBD, Westlands, Karen
   • Mombasa, Kisumu, Nakuru, Eldoret, and more

For urgent claims, please call our 24/7 claims hotline.

Is there anything else I can help you with while you wait?`;
}

/**
 * Generate contextual suggestions
 */
function generateSuggestions(userMessage, aiResponse, contextData) {
  const lowerMessage = userMessage.toLowerCase();
  const suggestions = [];

  // Product-related suggestions
  if (lowerMessage.includes('motor') || lowerMessage.includes('car') || lowerMessage.includes('vehicle')) {
    suggestions.push('Get a motor quote', 'Compare motor covers', 'Motor claim process');
  }

  if (lowerMessage.includes('medical') || lowerMessage.includes('health') || lowerMessage.includes('hospital')) {
    suggestions.push('Medical cover options', 'Family Medisure details', 'Health claim process');
  }

  if (lowerMessage.includes('life') || lowerMessage.includes('death') || lowerMessage.includes('family')) {
    suggestions.push('Life cover options', 'Education savings plan', 'Retirement planning');
  }

  if (lowerMessage.includes('invest') || lowerMessage.includes('save') || lowerMessage.includes('money')) {
    suggestions.push('Money Market Fund', 'Unit Trust options', 'Wealth management');
  }

  // General suggestions if no specific matches
  if (suggestions.length === 0) {
    suggestions.push('Get a quote', 'File a claim', 'Find a branch', 'Contact support');
  }

  // Add branch suggestion if location mentioned
  if (lowerMessage.includes('branch') || lowerMessage.includes('office') || lowerMessage.includes('near')) {
    suggestions.push('Branch locations', 'Branch opening hours');
  }

  // Add Easy Bima suggestion for digital queries
  if (lowerMessage.includes('online') || lowerMessage.includes('digital') || lowerMessage.includes('app')) {
    suggestions.push('Easy Bima platform', 'Get online quote');
  }

  // Limit to 4 suggestions
  return suggestions.slice(0, 4);
}

module.exports = { handleChat };