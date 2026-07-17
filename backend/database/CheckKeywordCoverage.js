//
// One-off CLI to audit insurance_products.keywords coverage.
//
// Context: searchInsuranceProducts() now tries a curated keywords[] match
// FIRST (most trusted, catches nicknames/slang like "haba haba" that never
// appear in description/benefits text), then falls back to ILIKE across
// name/category/sub_category/description/benefits.
//
// Products with a thin or empty keywords[] array get NO benefit from the
// first, more reliable stage — they depend entirely on ILIKE substring
// matching against prose text. This script lists those products so you
// know which ones to go tag by hand (or feed through an LLM-assisted
// keyword generator) to actually improve retrieval accuracy.
//
// Usage:
//   node database/checkKeywordCoverage.js
//   node database/checkKeywordCoverage.js --threshold=3
//   node database/checkKeywordCoverage.js --category="Savings"
//   node database/checkKeywordCoverage.js --format=json > coverage.json
//

require('dotenv').config();
const { pool } = require('../config/database');

function parseArgs() {
  const args = {};
  for (const raw of process.argv.slice(2)) {
    const match = raw.match(/^--([^=]+)=(.*)$/);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

async function main() {
  const { threshold = '2', category = null, format = 'table' } = parseArgs();
  const minKeywords = parseInt(threshold, 10);

  if (Number.isNaN(minKeywords) || minKeywords < 0) {
    console.error(`Invalid --threshold "${threshold}" — must be a non-negative integer.`);
    process.exit(1);
  }

  const params = [minKeywords];
  let categoryFilter = '';
  if (category) {
    params.push(category);
    categoryFilter = `AND category ILIKE $${params.length}`;
  }

  const sql = `
    SELECT id, name, category, sub_category, keywords,
           cardinality(keywords) AS keyword_count
    FROM insurance_products
    WHERE is_active = true
      AND cardinality(keywords) < $1
      ${categoryFilter}
    ORDER BY keyword_count ASC, category, sub_category, name
  `;

  const result = await pool.query(sql, params);

  // Also grab a total count for context (what % of the catalog is affected)
  const totals = await pool.query(
    `SELECT COUNT(*) AS total FROM insurance_products WHERE is_active = true`
  );
  const totalActive = parseInt(totals.rows[0].total, 10);
  const flaggedCount = result.rowCount;
  const pct = totalActive > 0 ? ((flaggedCount / totalActive) * 100).toFixed(1) : '0.0';

  if (format === 'json') {
    console.log(JSON.stringify({
      threshold: minKeywords,
      totalActiveProducts: totalActive,
      flaggedCount,
      flaggedPct: Number(pct),
      products: result.rows,
    }, null, 2));
  } else {
    console.log(`\n📋 Keyword coverage audit — insurance_products`);
    console.log(`   threshold : fewer than ${minKeywords} keyword(s)`);
    if (category) console.log(`   category  : ${category}`);
    console.log(`   flagged   : ${flaggedCount} / ${totalActive} active products (${pct}%)\n`);

    if (flaggedCount === 0) {
      console.log('✅ No products below the threshold — keyword coverage looks good.');
    } else {
      for (const row of result.rows) {
        const kw = row.keywords.length > 0 ? row.keywords.join(', ') : '(none)';
        console.log(`⚠️  [${row.keyword_count}] ${row.name}  —  ${row.category}${row.sub_category ? ' / ' + row.sub_category : ''}`);
        console.log(`      keywords: ${kw}`);
      }
      console.log(`\nTip: re-run with --format=json to pipe this into a script, or --category="X" to focus on one product line.`);
    }
  }

  await pool.end();
}

main().catch((error) => {
  console.error('❌ Keyword coverage audit failed:', error);
  process.exit(1);
});