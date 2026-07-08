// ---------------------------------------------------------------------------
// generateBranchKeywords.js
//
// One-time (or occasionally-rerun) seeding script: reads every active branch,
// asks the LLM to suggest location-search keyword tags for it (landmarks,
// nicknames, malls, road names, common misspellings, informal short names),
// and writes them into branches.keywords.
//
// Usage:
//   node scripts/generateBranchKeywords.js            # dry run, prints only
//   node scripts/generateBranchKeywords.js --write     # writes to DB
//
// Requires: OPENROUTER_API_KEY in .env (same var claudeService.js uses),
// and migrations/add_branch_keywords.sql already applied.
// ---------------------------------------------------------------------------

require('dotenv').config();
const { query } = require('../config/database');

const WRITE = process.argv.includes('--write');

async function suggestKeywords(branch) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet';

  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY not set in environment variables');
  }

  const prompt = `You are tagging an insurance branch office for a Kenyan customer support chatbot's location search.

Branch details:
- Name: ${branch.name}
- City: ${branch.city}
- Region: ${branch.region || 'N/A'}
- Address: ${branch.address || 'N/A'}

Suggest 6-12 short lowercase keyword tags a Kenyan customer might type when
looking for this branch. Include: informal/short place names, nearby
landmarks or malls if you can reasonably infer them from the address,
common alternate spellings, matatu stage names if applicable, and the
city/region itself. Do NOT invent landmarks you aren't reasonably confident
about — when in doubt, stick to what's in the name/city/region/address.

Respond ONLY with a JSON array of strings, nothing else. Example:
["nairobi cbd", "upper hill", "ngong road", "hospital road", "cic plaza"]`;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:3001',
      'X-Title': 'EasyBima Branch Keyword Seeder',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 300,
      reasoning: { exclude: true },
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || `OpenRouter API Error ${response.status}`);
  }

  const raw = data?.choices?.[0]?.message?.content?.trim() || '[]';
  const cleaned = raw.replace(/```json|```/g, '').trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) throw new Error('not an array');
    return parsed.map(k => String(k).toLowerCase().trim()).filter(Boolean);
  } catch (err) {
    console.warn(`  ⚠️  Could not parse keywords for "${branch.name}": ${raw}`);
    return [];
  }
}

async function main() {
  const { rows: branches } = await query(
    `SELECT id, name, city, region, address FROM branches WHERE is_active = true ORDER BY region, name`
  );

  console.log(`Found ${branches.length} active branches. Mode: ${WRITE ? 'WRITE' : 'DRY RUN (pass --write to save)'}\n`);

  for (const branch of branches) {
    process.stdout.write(`→ ${branch.name} (${branch.city})... `);
    try {
      const keywords = await suggestKeywords(branch);
      console.log(keywords.join(', ') || '(none)');

      if (WRITE && keywords.length > 0) {
        await query(`UPDATE branches SET keywords = $1::text[] WHERE id = $2`, [keywords, branch.id]);
      }
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
    }
  }

  console.log('\nDone.');
  if (!WRITE) console.log('This was a dry run — rerun with --write to save these to the database.');
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});