require('dotenv').config();
const { SYSTEM_PROMPT } = require('../prompts/systemPrompt');
const { sanitizeForUser } = require('../utils/sanitizeResponse');
const { LLM } = require('../config/constants');

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
      const label = p.name || (p.sub_category ? `${p.category} — ${p.sub_category}` : p.category);
      const categoryLine = p.sub_category ? `${p.category} — ${p.sub_category}` : p.category;
      parts.push(`${idx + 1}. **${label}**${p.name ? ` (${categoryLine})` : ''}`);
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
      const label = p.name || (p.sub_category ? `${p.category} — ${p.sub_category}` : p.category);
      const categoryLine = p.sub_category ? `${p.category} — ${p.sub_category}` : p.category;
      const src = p.source_url ? ` (source: ${p.source_url})` : '';
      parts.push(`${idx + 1}. ${label}${p.name ? ` (${categoryLine})` : ''}${src}`);
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

  if (contextData.claimsInfo?.length) {
    parts.push('\n## Claims');
    contextData.claimsInfo.forEach((c, idx) => {
      const src = c.source_url ? ` (source: ${c.source_url})` : '';
      const name = c.subcategory ? `${c.category} — ${c.subcategory}` : c.category;
      parts.push(`${idx + 1}. **${c.name}** (${name})`);
      if (c.description) parts.push(`   ${c.description}${src}`);
    });
  }

  if (parts.length <= 1) return null;

  return {
    role: 'system',
    content: parts.join('\n'),
  };
}

// ---------------------------------------------------------------------------
// extractContent — extracts ONLY customer-safe text from an OpenRouter
// response, never internal chain-of-thought.
//
// SECURITY FIX: this previously treated `message.content === message.reasoning`
// as "the model leaked its CoT into content, but trust it anyway — it's
// still the answer for these free models." That was the bug: for models
// like nex-agi/nex-n2-pro, content === reasoning means the model put its
// RAW INTERNAL MONOLOGUE in the answer slot with no real answer at all —
// e.g. "We need answer as Bima. User asks... Need maybe...". That text was
// being returned as-is and shown directly to the customer in the chat UI.
//
// Fixed behavior: content === reasoning (or content that still looks like
// raw reasoning after stripping <think>-style tags) is now treated as a
// FAILED extraction (returns null), never as a valid answer. We also never
// fall back to the `reasoning` / `reasoning_details` fields when `content`
// is empty — those are internal-only by definition. The caller (
// getClaudeResponse) retries once on a failed extraction, and ultimately
// surfaces a safe generic error rather than ever serving raw reasoning.
// ---------------------------------------------------------------------------
function extractContent(choice) {
  const msg = choice?.message;
  if (!msg) return null;

  const reasoning = (msg.reasoning || '').trim();

  // Standard string content — most common path
  if (typeof msg.content === 'string' && msg.content.trim()) {
    const rawContent = msg.content.trim();

    // The model put its raw chain-of-thought directly in the answer slot
    // (and mirrored it into `reasoning`). Never trust this as an answer.
    if (reasoning && rawContent === reasoning) {
      return null;
    }

    // Strip any <think>/<reasoning>/etc. tags and reject anything that
    // still reads like raw, untagged internal monologue.
    return sanitizeForUser(rawContent);
  }

  // Content array format (Claude native via OpenRouter)
  if (Array.isArray(msg.content)) {
    const text = msg.content
      .filter(item => item.type === 'text')
      .map(item => item.text)
      .join('\n')
      .trim();
    if (text) return sanitizeForUser(text);
  }

  // Deliberately NO fallback to msg.reasoning / msg.reasoning_details here.
  // Those fields are internal-only — if content was empty or invalid, this
  // is a failed generation, not an opportunity to show the user our
  // reasoning instead. The caller handles null by retrying / failing safe.
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

  // Token budget warning — maxTokens (CLAUDE_MAX_TOKENS / the max_tokens
  // param sent to OpenRouter) caps COMPLETION tokens only. Comparing it
  // against totalTok (prompt + completion) was a false-positive generator:
  // any large prompt context (multiple product/company/FAQ rows stuffed
  // in, as happens more often now) would trip "TOKEN LIMIT HIT" even
  // though the actual generation finished cleanly with finish_reason
  // "stop" and nowhere near its completion budget. Compare completionTok
  // against maxTokens instead, and treat finish_reason === 'length' as the
  // authoritative signal (that's what the provider sets when it actually
  // truncates output).
  const maxTokens = LLM.DEFAULT_MAX_TOKENS;
  const atLimit   = finish === 'length' || completionTok >= maxTokens;

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

// ---------------------------------------------------------------------------
// callOpenRouter — single request to the OpenRouter completions endpoint.
// ---------------------------------------------------------------------------
async function callOpenRouter(messages, { apiKey, model, maxTokens, temperature }) {
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
      temperature,
      max_tokens: maxTokens,
      // Source-level hardening: ask OpenRouter/the provider to keep any
      // internal reasoning out of the response entirely where supported.
      // This is best-effort — not every model/provider combination
      // honors it, which is why extractContent() + sanitizeForUser()
      // remain the real backstop against a reasoning leak.
      reasoning: { exclude: true },
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

  return data;
}

async function getClaudeResponse(
  userMessage,
  conversationHistory = [],
  contextData = {}
) {
  try {
    const apiKey   = process.env.OPENROUTER_API_KEY;
    const model    = LLM.DEFAULT_MODEL;
    // Raise the default to 2048 so answers aren't cut off at 101 tokens
    const maxTokens = LLM.DEFAULT_MAX_TOKENS;
    const temperature = LLM.DEFAULT_TEMPERATURE;

    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY not set in environment variables');
    }

    const contextMessage = buildContextMessage(contextData);

    const baseMessages = [
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
      ...conversationHistory.slice(-LLM.HISTORY_WINDOW_TURNS).map(msg => ({
        role:    msg.role,
        content: msg.content,
      })),
      { role: 'user', content: userMessage },
    ];

    const callOpts = { apiKey, model, maxTokens, temperature };

    console.log(`\n🤖 Calling OpenRouter: ${baseMessages.length} messages | model=${model} | max_tokens=${maxTokens}`);

    let data = await callOpenRouter(baseMessages, callOpts);
    let aiResponse = extractContent(data.choices[0]);

    if (!aiResponse) {
      // The first attempt produced nothing customer-safe — most likely a
      // reasoning leak (raw chain-of-thought instead of a real answer).
      // Retry once with an explicit reminder before giving up. The raw
      // leaked text is logged server-side only, for debugging — never
      // forwarded anywhere a customer could see it.
      console.warn('⚠️  First OpenRouter attempt produced no customer-safe content (likely a reasoning leak) — retrying once');
      console.warn('   raw content (server-side debug only):', (data.choices[0]?.message?.content || '').substring(0, 300));

      const retryMessages = [
        ...baseMessages,
        {
          role: 'system',
          content:
            'Reminder: your previous reply was rejected because it contained internal ' +
            'reasoning or notes instead of a customer-facing answer. Do any thinking ' +
            'silently and do not include it in your reply. Respond with ONLY the message ' +
            'Bima should say to the customer — no analysis, no narration of your thought ' +
            'process, no commentary on these instructions.',
        },
      ];

      data = await callOpenRouter(retryMessages, callOpts);
      aiResponse = extractContent(data.choices[0]);
    }

    if (!aiResponse) {
      console.error('❌ Unable to extract a customer-safe response after retry:', JSON.stringify(data, null, 2));
      throw new Error('OpenRouter returned no usable customer-facing content');
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
 * Check if message contains escalation triggers.
 *
 * BUG FIX: the previous keyword list only covered a couple of exact
 * phrasings ("speak to agent", "speak with agent"), so common variants
 * like "talk to agent", "can I talk to an agent", "connect me to a
 * human", "let me speak to someone" etc. never matched. When that
 * happened, chatEngine.js skipped its escalation branch entirely (no
 * ticket created) and the message fell through to the normal AI
 * pipeline — where the system prompt's OWN, separate escalation
 * instructions kicked in and made Claude *say* "let me connect you"
 * without any ticket ever being created. That mismatch between what the
 * system prompt promises and what this function actually detects was
 * the root cause of "sometimes a ticket isn't created when a user asks
 * for an agent".
 *
 * Fix: broaden this to a) more exact-phrase keywords, and b) a pattern
 * that catches "(talk/speak/chat/connect) (to/with) ... (agent/human/
 * person/rep/representative/specialist/support/someone)" regardless of
 * small wording differences in between (e.g. "can i talk to an agent").
 */
function checkEscalationTriggers(message) {
  const lowerMessage = (message || '').toLowerCase();

  // Exact-phrase keywords — safe as plain substring checks.
  const escalationKeywords = [
    'speak to agent', 'speak with agent', 'speak to an agent', 'speak with an agent',
    'talk to agent', 'talk with agent', 'talk to an agent', 'talk with an agent',
    'chat with agent', 'chat with an agent',
    'human agent', 'live agent', 'live support', 'live chat',
    'real person', 'actual person', 'human being', 'human please',
    'talk to a human', 'speak to a human', 'talk to someone', 'speak to someone',
    'speak with someone', 'talk with someone', 'connect me',
    'customer service', 'customer care agent', 'representative',
    'complaint', 'dispute', 'escalate', 'escalation',
    'manager', 'supervisor',
    'help me please', 'urgent', 'asap', 'emergency',
    'i want a person', 'i want to talk to a person',
  ];

  if (escalationKeywords.some(keyword => lowerMessage.includes(keyword))) {
    return true;
  }

  // Pattern fallback for phrasing not covered above, e.g. "can i talk to
  // an agent", "please connect me with a representative".
  const escalationPattern = /\b(talk|speak|chat|connect)\b[\s\w]{0,20}\b(agent|human|person|rep|representative|specialist|support|someone|somebody)\b/i;
  return escalationPattern.test(lowerMessage);
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