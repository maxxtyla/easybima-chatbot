require('dotenv').config();
const { SYSTEM_PROMPT } = require('../prompts/systemPrompt');

/**
 * Builds the RAG context system message injected before the conversation.
 */
function buildContextMessage(contextData = {}) {
  const parts = [];
  parts.push(
    'IMPORTANT: Answer using ONLY the database information below. ' +
    'Do NOT invent facts. Cite source URLs in parentheses where available.'
  );

  if (contextData.companyInfo?.length) {
    parts.push('\n## Company Knowledge');
    contextData.companyInfo.forEach((info, idx) => {
      const src = info.source_url ? ` (source: ${info.source_url})` : '';
      parts.push(`${idx + 1}. **${info.title}** — ${info.content}${src}`);
    });
  }

  if (contextData.faqContext?.length) {
    parts.push('\n## Frequently Asked Questions');
    contextData.faqContext.forEach((f, idx) => {
      const src = f.source_url ? ` (source: ${f.source_url})` : '';
      parts.push(`${idx + 1}. Q: ${f.question}\n   A: ${f.answer}${src}`);
    });
  }

  if (contextData.products?.length) {
    parts.push('\n## CIC Insurance Products');
    contextData.products.forEach((p, idx) => {
      const src = p.source_url ? ` (source: ${p.source_url})` : '';
      const name = p.sub_category ? `${p.category} — ${p.sub_category}` : p.category;
      parts.push(`${idx + 1}. **${name}**`);
      if (p.description) parts.push(`   Description: ${p.description}`);
      if (p.benefits)    parts.push(`   Benefits: ${p.benefits}${src}`);
    });
  }

  if (!contextData.products?.length && contextData.recommendations?.matchedProducts?.length) {
    parts.push('\n## Recommended Products');
    parts.push(`Category: ${contextData.recommendations.category}`);
    if (contextData.recommendations.description) {
      parts.push(`Description: ${contextData.recommendations.description}`);
    }
    contextData.recommendations.matchedProducts.forEach((p, idx) => {
      const name = p.sub_category
        ? `${p.category} — ${p.sub_category}`
        : (p.name || p.category);
      const src = p.source_url ? ` (source: ${p.source_url})` : '';
      parts.push(`${idx + 1}. ${name}${src}`);
      if (p.description) parts.push(`   ${p.description}`);
      if (p.benefits)    parts.push(`   Benefits: ${p.benefits}`);
    });
  }

  if (contextData.branches?.length) {
    parts.push('\n## Branch Locations');
    contextData.branches.forEach(branch => {
      const src = branch.source_url ? ` (source: ${branch.source_url})` : '';
      const location = [branch.city, branch.region].filter(Boolean).join(', ');
      parts.push(
        `- **${branch.name}**${location ? ' (' + location + ')' : ''}` +
        `${branch.address ? ' — ' + branch.address : ''}` +
        `${branch.phone ? ' | Tel: ' + branch.phone : ''}${src}`
      );
    });
  }

  if (parts.length <= 1) return null;

  return {
    role: 'system',
    content: parts.join('\n'),
  };
}

// ---------------------------------------------------------------------------
// extractContent — strips reasoning leak from models that echo chain-of-thought
// into the content field (e.g. nex-agi/nex-n2-pro).
//
// Some free/experimental models on OpenRouter put identical text in both
// message.content and message.reasoning. When they match exactly, we trust
// content as-is (it IS the answer). But some models wrap the real answer
// inside the reasoning block and leave content empty or repeat it — this
// function handles all known variants cleanly.
// ---------------------------------------------------------------------------
function extractContent(choice) {
  const msg = choice?.message;
  if (!msg) return null;

  // Standard string content — most common path
  if (typeof msg.content === 'string' && msg.content.trim()) {
    const content = msg.content.trim();
    const reasoning = (msg.reasoning || '').trim();

    // If content === reasoning exactly, the model leaked its CoT into content.
    // Trust it anyway — it's still the answer text for these free models.
    // Return it directly; no stripping needed.
    if (content === reasoning) {
      return content;
    }

    return content;
  }

  // Content array format (Claude native via OpenRouter)
  if (Array.isArray(msg.content)) {
    const text = msg.content
      .filter(item => item.type === 'text')
      .map(item => item.text)
      .join('\n')
      .trim();
    if (text) return text;
  }

  // Fallback: try reasoning field if content was empty
  // (some models only populate reasoning, not content)
  if (typeof msg.reasoning === 'string' && msg.reasoning.trim()) {
    return msg.reasoning.trim();
  }

  // reasoning_details array (seen in nex-n2-pro)
  if (Array.isArray(msg.reasoning_details)) {
    const text = msg.reasoning_details
      .filter(d => d.type === 'reasoning.text' && d.text)
      .map(d => d.text)
      .join('\n')
      .trim();
    if (text) return text;
  }

  return null;
}

// ---------------------------------------------------------------------------
// logOpenRouterResponse — structured debug log replacing the raw JSON dump.
// Shows the key fields you actually care about without flooding the terminal.
// ---------------------------------------------------------------------------
function logOpenRouterResponse(data, aiResponse) {
  const choice    = data?.choices?.[0];
  const usage     = data?.usage || {};
  const msg       = choice?.message || {};
  const model     = data?.model || 'unknown';
  const provider  = data?.provider || 'unknown';
  const finish    = choice?.finish_reason || '?';

  const promptTok     = usage.prompt_tokens || 0;
  const completionTok = usage.completion_tokens || 0;
  const totalTok      = usage.total_tokens || 0;
  const reasoningTok  = usage.completion_tokens_details?.reasoning_tokens || 0;
  const cost          = usage.cost ?? 0;

  // Token budget warning
  const maxTokens = parseInt(process.env.CLAUDE_MAX_TOKENS) || 2048;
  const atLimit   = totalTok >= maxTokens;

  console.log('\n──────────────────────────────────────────────');
  console.log(`📦 OpenRouter Response`);
  console.log(`   model     : ${model} (via ${provider})`);
  console.log(`   finish    : ${finish}${atLimit ? ' ⚠️  TOKEN LIMIT HIT' : ''}`);
  console.log(`   tokens    : ${promptTok} prompt + ${completionTok} completion = ${totalTok} total`);
  if (reasoningTok > 0) {
    console.log(`   reasoning : ${reasoningTok} tokens (internal CoT, not shown to user)`);
  }
  console.log(`   cost      : $${cost}`);
  console.log(`\n   content   :\n${'-'.repeat(46)}`);
  console.log(aiResponse || '(empty)');
  console.log('──────────────────────────────────────────────\n');

  if (msg.reasoning && msg.reasoning !== msg.content) {
    console.log(`💭 Model reasoning (separate from content):\n${'-'.repeat(46)}`);
    console.log(msg.reasoning.substring(0, 500) + (msg.reasoning.length > 500 ? '...' : ''));
    console.log('──────────────────────────────────────────────\n');
  }
}

async function getClaudeResponse(
  userMessage,
  conversationHistory = [],
  contextData = {}
) {
  try {
    const apiKey   = process.env.OPENROUTER_API_KEY;
    const model    = process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet';
    // Raise the default to 2048 so answers aren't cut off at 101 tokens
    const maxTokens = parseInt(process.env.CLAUDE_MAX_TOKENS) || 2048;

    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY not set in environment variables');
    }

    const contextMessage = buildContextMessage(contextData);

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'system',
        content:
          'Use ONLY the facts supplied in the database context below. ' +
          'Cite source URLs for any fact you present. ' +
          'If the answer is not in the database, say so and offer next steps. ' +
          'Do not hallucinate product names, prices, or branch addresses.',
      },
      ...(contextMessage ? [contextMessage] : []),
      ...conversationHistory.slice(-8).map(msg => ({
        role:    msg.role,
        content: msg.content,
      })),
      { role: 'user', content: userMessage },
    ];

    console.log(`\n🤖 Calling OpenRouter: ${messages.length} messages | model=${model} | max_tokens=${maxTokens}`);

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3001',
        'X-Title':      'EasyBima Chatbot',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: parseFloat(process.env.CLAUDE_TEMPERATURE) || 0.2,
        max_tokens:  maxTokens,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ OpenRouter Error:', JSON.stringify(data, null, 2));
      throw new Error(data?.error?.message || `OpenRouter API Error ${response.status}`);
    }

    if (!data?.choices?.length) {
      throw new Error(`No choices returned from OpenRouter: ${JSON.stringify(data)}`);
    }

    const aiResponse = extractContent(data.choices[0]);

    if (!aiResponse) {
      console.error('❌ Unable to extract text response:', JSON.stringify(data, null, 2));
      throw new Error('OpenRouter returned no text content');
    }

    // Structured log instead of raw JSON dump
    logOpenRouterResponse(data, aiResponse);

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
    'speak to agent', 'speak with agent', 'human agent', 'customer service',
    'complaint', 'dispute', 'escalate', 'manager', 'supervisor',
    'help me please', 'urgent', 'asap', 'emergency',
  ];
  const lowerMessage = message.toLowerCase();
  return escalationKeywords.some(keyword => lowerMessage.includes(keyword));
}

/**
 * Detect sentiment of message
 */
function detectSentiment(message) {
  const angryWords = [
    'angry', 'frustrated', 'upset', 'annoyed', 'furious', 'mad',
    'hate', 'terrible', 'awful', 'disgusting',
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
