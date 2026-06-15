require('dotenv').config();
const { SYSTEM_PROMPT } = require('../prompts/systemPrompt');

/**
 * Get response from OpenRouter API
 */
function buildContextMessage(contextData = {}) {
  const parts = [];

  if (contextData.companyInfo?.length) {
    parts.push('Company information from the knowledge database:');
    contextData.companyInfo.forEach((info, idx) => {
      parts.push(`${idx + 1}. ${info.title} — ${info.content}`);
    });
  }
  if (contextData.recommendations && contextData.recommendations.matchedProducts) {
    parts.push('Recommended products from the database:');
    parts.push(`Category: ${contextData.recommendations.category}`);
    parts.push(`Description: ${contextData.recommendations.description}`);
    parts.push('Matched products:');
    parts.push(contextData.recommendations.matchedProducts.map(p => `- ${p.name || p}`).join('\n'));
  }

  if (contextData.branches && contextData.branches.length > 0) {
    parts.push('Branch location information from the database:');
    contextData.branches.forEach(branch => {
      parts.push(`- ${branch.name}${branch.city ? ', ' + branch.city : ''}${branch.address ? ' — ' + branch.address : ''}`);
    });
  }

  if (parts.length === 0) {
    return null;
  }

  return {
    role: 'system',
    content: parts.join('\n'),
  };
}

async function getClaudeResponse(userMessage, conversationHistory = [], contextData = {}) {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    const model = process.env.OPENROUTER_MODEL || 'meta-llama/llama-2-70b-chat';

    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY not set in environment variables');
    }

    const contextMessage = buildContextMessage(contextData);

    // Build messages array
    const messages = [
      {
        role: 'system',
        content: SYSTEM_PROMPT,
      },
      ...(contextMessage ? [contextMessage] : []),
      ...conversationHistory.map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
      { role: 'user', content: userMessage },
    ];

    console.log(`🤖 Calling OpenRouter API with ${messages.length} messages...`);

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'http://localhost:3001',
        'X-Title': 'EasyBima Chatbot',
      },
      body: JSON.stringify({
        model: model,
        messages,
        temperature: parseFloat(process.env.CLAUDE_TEMPERATURE) || 0.7,
        max_tokens: parseInt(process.env.CLAUDE_MAX_TOKENS) || 1024,
      }),
    });

    const data = await response.json();

    // Check for errors
    if (!response.ok) {
      console.error('❌ OpenRouter API Error:', data);
      throw new Error(
        data.error?.message || 
        `API Error: ${response.status} ${response.statusText}`
      );
    }

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('Invalid response from OpenRouter API');
    }

    const aiResponse = data.choices[0].message.content;
    console.log(`✅ OpenRouter response received (${aiResponse.length} chars)`);

    return aiResponse;
  } catch (error) {
    console.error('❌ OpenRouter API Error:', error.message);
    throw error;
  }
}

/**
 * Check if message contains escalation triggers
 */
function checkEscalationTriggers(message) {
  const escalationKeywords = [
    'speak to agent',
    'speak with agent',
    'human agent',
    'customer service',
    'complaint',
    'dispute',
    'escalate',
    'manager',
    'supervisor',
    'help me please',
    'urgent',
    'asap',
    'emergency',
  ];

  const lowerMessage = message.toLowerCase();
  return escalationKeywords.some(keyword => lowerMessage.includes(keyword));
}

/**
 * Detect sentiment of message
 */
function detectSentiment(message) {
  const angryWords = [
    'angry',
    'frustrated',
    'angry',
    'upset',
    'annoyed',
    'furious',
    'mad',
    'hate',
    'terrible',
    'awful',
    'disgusting',
    '!',
    '!!!',
  ];

  const happyWords = ['great', 'awesome', 'excellent', 'wonderful', 'love', 'perfect'];

  const lowerMessage = message.toLowerCase();

  const angryCount = angryWords.filter(word => lowerMessage.includes(word)).length;
  const happyCount = happyWords.filter(word => lowerMessage.includes(word)).length;

  if (angryCount > 0) return 'angry';
  if (happyCount > 0) return 'happy';
  return 'neutral';
}

module.exports = {
  getClaudeResponse,
  checkEscalationTriggers,
  detectSentiment,
};