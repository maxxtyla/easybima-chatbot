require('dotenv').config();
const { SYSTEM_PROMPT } = require('../prompts/systemPrompt');

/**
 * Get response from OpenRouter API
 */
function buildContextMessage(contextData = {}) {
  const parts = [];
  parts.push('IMPORTANT: The assistant must ONLY use the information provided below from the database. Do NOT invent facts. For any fact include its source URL in parentheses when used.');

  if (contextData.companyInfo?.length) {
    parts.push('\nCompany information from the knowledge database:');
    contextData.companyInfo.forEach((info, idx) => {
      const src = info.source_url ? ` (source: ${info.source_url})` : '';
      parts.push(`${idx + 1}. ${info.title} — ${info.content}${src}`);
    });
  }
  if (contextData.faqContext?.length) {
  parts.push('\nFrequently asked questions from the knowledge base:');
  contextData.faqContext.forEach((f, idx) => {
    const src = f.source_url ? ` (source: ${f.source_url})` : '';
    parts.push(`${idx + 1}. Q: ${f.question}\n   A: ${f.answer}${src}`);
  });
}
  if (contextData.recommendations && contextData.recommendations.matchedProducts) {
    parts.push('Recommended products from the database:');
    parts.push(`Category: ${contextData.recommendations.category}`);
    parts.push(`Description: ${contextData.recommendations.description}`);
    parts.push('Matched products:');
    parts.push(contextData.recommendations.matchedProducts.map(p => `- ${p.name || p.category || p.sub_category}${p.source_url ? ` (source: ${p.source_url})` : ''}`).join('\n'));
  }

  if (contextData.branches && contextData.branches.length > 0) {
    parts.push('Branch location information from the database:');
    contextData.branches.forEach(branch => {
      const src = branch.source_url ? ` (source: ${branch.source_url})` : '';
      parts.push(`- ${branch.name}${branch.city ? ', ' + branch.city : ''}${branch.address ? ' — ' + branch.address : ''}${src}`);
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

async function getClaudeResponse(
  userMessage,
  conversationHistory = [],
  contextData = {}
) {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    const model =
      process.env.OPENROUTER_MODEL ||
      'anthropic/claude-3.5-sonnet';

    if (!apiKey) {
      throw new Error(
        'OPENROUTER_API_KEY not set in environment variables'
      );
    }

    const contextMessage = buildContextMessage(contextData);

    const messages = [
      {
        role: 'system',
        content: SYSTEM_PROMPT,
      },
      {
        role: 'system',
        content:
          'When answering use ONLY the facts and entries supplied in the context. Cite source URLs for any fact you present. If the answer is not present in the database, say you do not have that information and offer next steps. Do not hallucinate.',
      },
      ...(contextMessage ? [contextMessage] : []),
      ...conversationHistory.map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
      {
        role: 'user',
        content: userMessage,
      },
    ];

    console.log(
      `🤖 Calling OpenRouter API with ${messages.length} messages`
    );

    const response = await fetch(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:3001',
          'X-Title': 'EasyBima Chatbot',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature:
            parseFloat(process.env.CLAUDE_TEMPERATURE) || 0.2,
          max_tokens:
            parseInt(process.env.CLAUDE_MAX_TOKENS) || 1024,
        }),
      }
    );

    const data = await response.json();

    console.log(
      '📦 OpenRouter response:',
      JSON.stringify(data, null, 2)
    );

    if (!response.ok) {
      console.error('❌ OpenRouter Error:', data);

      throw new Error(
        data?.error?.message ||
          `OpenRouter API Error ${response.status}`
      );
    }

    if (!data?.choices?.length) {
      throw new Error(
        `No choices returned from OpenRouter: ${JSON.stringify(
          data
        )}`
      );
    }

    const choice = data.choices[0];

    let aiResponse = null;

    // Standard OpenAI/OpenRouter format
    if (
      typeof choice?.message?.content === 'string'
    ) {
      aiResponse = choice.message.content;
    }

    // Claude/OpenRouter content array format
    else if (
      Array.isArray(choice?.message?.content)
    ) {
      aiResponse = choice.message.content
        .filter(item => item.type === 'text')
        .map(item => item.text)
        .join('\n');
    }

    // Alternative content field
    else if (
      Array.isArray(data?.content)
    ) {
      aiResponse = data.content
        .filter(item => item.type === 'text')
        .map(item => item.text)
        .join('\n');
    }

    if (
      !aiResponse ||
      typeof aiResponse !== 'string'
    ) {
      console.error(
        '❌ Unable to extract text response:',
        JSON.stringify(data, null, 2)
      );

      throw new Error(
        'OpenRouter returned no text content'
      );
    }

    aiResponse = aiResponse.trim();

    console.log(
      `✅ OpenRouter response received (${aiResponse.length} chars)`
    );

    return aiResponse;
  } catch (error) {
    console.error(
      '❌ OpenRouter API Error:',
      error.message
    );

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