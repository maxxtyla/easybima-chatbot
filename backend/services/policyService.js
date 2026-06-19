const { query } = require('../config/database');

// ---------------------------------------------------------------------------
// STOP-WORDS — filtered out before keyword matching so generic words like
// "what", "your", "offer" don't dilute or block real matches.
// ---------------------------------------------------------------------------
const STOP_WORDS = new Set([
  'the','and','for','are','but','not','you','all','any','can','her','was',
  'one','our','out','had','his','has','have','him','his','how','its','may',
  'nor','now','own','say','she','too','use','was','way','who','why','will',
  'with','that','this','they','from','been','come','does','done','each',
  'even','find','give','goes','into','just','know','like','make','more',
  'much','need','only','over','same','such','take','tell','than','them',
  'then','thus','till','upon','used','very','want','well','were','what',
  'when','whom','your','about','after','also','back','both','does','down',
  'duly','else','find','first','from','give','good','here','just','keep',
  'kind','last','left','life','live','long','look','most','much','near',
  'next','only','open','part','past','seek','self','show','some','sort',
  'stay','such','tell','tend','time','type','unto','upon','used','view',
  'ways','wish','work','year','years','offer','offers','product','products',
  'insurance','insure','insured','policy','policies','does','have','please',
  'would','could','should','shall','might','must','been','being','where',
  'there','their','those','these','other','every','which','while','before',
]);

// ---------------------------------------------------------------------------
// Helper — extract meaningful keywords, filtering stop-words and short tokens
// ---------------------------------------------------------------------------
function extractKeywords(searchQuery) {
  return searchQuery
    .toLowerCase()
    .split(/\W+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

// ---------------------------------------------------------------------------
// Helper — builds individual ILIKE conditions from a keyword array so that
// each word is matched independently.
// Returns: { conditions: string, params: any[], nextIndex: number }
// ---------------------------------------------------------------------------
function buildIlikeConditions(keywords, columns, startIndex = 1) {
  const conditions = keywords
    .map((_, i) => {
      const paramIdx = startIndex + i;
      return `(${columns.map(col => `${col} ILIKE $${paramIdx}`).join(' OR ')})`;
    })
    .join(' OR ');

  const params = keywords.map(k => `%${k}%`);
  return { conditions, params, nextIndex: startIndex + keywords.length };
}

// ---------------------------------------------------------------------------
// Helper — wraps a plain JS array into the Postgres literal "{a,b,c}"
// ---------------------------------------------------------------------------
function toPgArray(arr) {
  if (!arr || arr.length === 0) return '{}';
  const escaped = arr.map(v => `"${String(v).replace(/"/g, '\\"')}"`);
  return `{${escaped.join(',')}}`;
}

// ---------------------------------------------------------------------------
// DEBUG LOGGER — logs which table was queried, what keywords were used,
// how many rows came back, and the first snippet of the SQL so you can see
// at a glance why a search returned 0 rows.
// ---------------------------------------------------------------------------
function logSearchDebug(tableName, keywords, rowCount, sql, fallback = false) {
  const status = rowCount === 0 ? '⚠️ ' : '✅';
  console.log(`\n${status} [RAG DEBUG] ${tableName}`);
  console.log(`   keywords : [${keywords.join(', ') || '(none — fell back to all-rows)'}]`);
  console.log(`   rows     : ${rowCount}`);
  if (fallback) console.log(`   mode     : FALLBACK (no keywords matched → returning top rows)`);
  console.log(`   sql      : ${sql.replace(/\s+/g, ' ').trim().substring(0, 120)}...`);
}

// ---------------------------------------------------------------------------
// searchFAQ
// ---------------------------------------------------------------------------
async function searchFAQ(searchQuery, limit = 5) {
  try {
    const keywords = extractKeywords(searchQuery);

    let result;
    let sql;
    let isFallback = false;

    if (keywords.length === 0) {
      // No meaningful keywords → return top-priority active rows
      isFallback = true;
      sql = `
        SELECT id, category, question, answer, keywords, priority,
               COALESCE(source_url, NULL) AS source_url
        FROM faq_entries
        WHERE is_active = true
        ORDER BY priority DESC
        LIMIT $1
      `;
      result = await query(sql, [limit]);
    } else {
      const { conditions, params, nextIndex } = buildIlikeConditions(
        keywords,
        ['question', 'answer'],
        1
      );
      sql = `
        SELECT id, category, question, answer, keywords, priority,
               COALESCE(source_url, NULL) AS source_url
        FROM faq_entries
        WHERE is_active = true
          AND (
            ${conditions}
            OR keywords && $${nextIndex}::text[]
          )
        ORDER BY priority DESC
        LIMIT $${nextIndex + 1}
      `;
      result = await query(sql, [...params, toPgArray(keywords), limit]);

      // Fallback: if keyword search returns nothing, fetch top-priority rows
      if (result.rowCount === 0) {
        isFallback = true;
        sql = `
          SELECT id, category, question, answer, keywords, priority,
                 COALESCE(source_url, NULL) AS source_url
          FROM faq_entries
          WHERE is_active = true
          ORDER BY priority DESC
          LIMIT $1
        `;
        result = await query(sql, [limit]);
      }
    }

    logSearchDebug('faq_entries', keywords, result.rowCount, sql, isFallback);
    return result.rows;
  } catch (err) {
    console.error('[RAG ERROR] FAQ search failed:', err.message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// searchInsuranceProducts
// ---------------------------------------------------------------------------
async function searchInsuranceProducts(searchQuery, limit = 5) {
  try {
    const keywords = extractKeywords(searchQuery);

    let result;
    let sql;
    let isFallback = false;

    if (keywords.length === 0) {
      // No keywords → return a broad sample of all active products
      isFallback = true;
      sql = `
        SELECT id, category, sub_category, description, benefits, keywords,
               COALESCE(source_url, NULL) AS source_url
        FROM insurance_products
        WHERE is_active = true
        ORDER BY category, sub_category
        LIMIT $1
      `;
      result = await query(sql, [limit]);
    } else {
      const { conditions, params, nextIndex } = buildIlikeConditions(
        keywords,
        ['category', 'sub_category', 'description', 'benefits'],
        1
      );
      sql = `
        SELECT id, category, sub_category, description, benefits, keywords,
               COALESCE(source_url, NULL) AS source_url
        FROM insurance_products
        WHERE is_active = true
          AND (
            ${conditions}
            OR keywords && $${nextIndex}::text[]
          )
        ORDER BY category, sub_category
        LIMIT $${nextIndex + 1}
      `;
      result = await query(sql, [...params, toPgArray(keywords), limit]);

      // Fallback: nothing matched → return top rows so AI always has product context
      if (result.rowCount === 0) {
        isFallback = true;
        sql = `
          SELECT id, category, sub_category, description, benefits, keywords,
                 COALESCE(source_url, NULL) AS source_url
          FROM insurance_products
          WHERE is_active = true
          ORDER BY category, sub_category
          LIMIT $1
        `;
        result = await query(sql, [limit]);
      }
    }

    logSearchDebug('insurance_products', keywords, result.rowCount, sql, isFallback);
    return result.rows;
  } catch (err) {
    console.error('[RAG ERROR] Insurance products search failed:', err.message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// getProducts — unchanged logic, kept for backwards compatibility
// ---------------------------------------------------------------------------
async function getProducts(category = null, subsidiary = null) {
  try {
    let sql = 'SELECT * FROM insurance_products WHERE is_active = true';
    const params = [];
    let paramIndex = 1;

    if (category) {
      sql += ` AND category ILIKE $${paramIndex}`;
      params.push(`%${category}%`);
      paramIndex++;
    }

    if (subsidiary) {
      sql += ` AND sub_category ILIKE $${paramIndex}`;
      params.push(`%${subsidiary}%`);
    }

    sql += ' ORDER BY category, sub_category';

    const result = await query(sql, params);
    return result.rows;
  } catch (err) {
    console.error('Product query error:', err.message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// findBranches
// The branches table may not have a source_url column yet.
// We query information_schema first and only SELECT it when it exists.
// ---------------------------------------------------------------------------
async function findBranches(city = null) {
  try {
    const colCheck = await query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_name = 'branches' AND column_name = 'source_url'
       LIMIT 1`
    );
    const hasSourceUrl = colCheck.rows.length > 0;
    const sourceUrlCol = hasSourceUrl ? 'source_url' : 'NULL::text AS source_url';

    let sql;
    let params = [];
    let isFallback = false;

    if (city) {
      sql = `
        SELECT id, name, phone, address, region, city,
               ${sourceUrlCol}
        FROM branches
        WHERE is_active = true
          AND (city ILIKE $1 OR region ILIKE $1 OR address ILIKE $1)
        ORDER BY region, name
      `;
      params = [`%${city}%`];
    } else {
      sql = `
        SELECT id, name, phone, address, region, city,
               ${sourceUrlCol}
        FROM branches
        WHERE is_active = true
        ORDER BY region, name
      `;
    }

    const result = await query(sql, params);

    // If city-specific search returned nothing, fall back to all branches
    if (result.rowCount === 0 && city) {
      isFallback = true;
      sql = `
        SELECT id, name, phone, address, region, city,
               ${sourceUrlCol}
        FROM branches
        WHERE is_active = true
        ORDER BY region, name
      `;
      const fallbackResult = await query(sql, []);
      logSearchDebug('branches', city ? [city] : [], fallbackResult.rowCount, sql, true);
      return fallbackResult.rows;
    }

    logSearchDebug('branches', city ? [city] : [], result.rowCount, sql, isFallback);
    return result.rows;
  } catch (err) {
    console.error('[RAG ERROR] Branch query failed:', err.message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// searchCompanyKnowledge
// ---------------------------------------------------------------------------
async function searchCompanyKnowledge(searchQuery, limit = 3) {
  try {
    const keywords = extractKeywords(searchQuery);

    let result;
    let sql;
    let isFallback = false;

    if (keywords.length === 0) {
      isFallback = true;
      sql = `
        SELECT id, section, title, content, tags,
               COALESCE(source_url, NULL) AS source_url
        FROM company_knowledge
        WHERE is_active = true
        ORDER BY updated_at DESC
        LIMIT $1
      `;
      result = await query(sql, [limit]);
    } else {
      const { conditions, params, nextIndex } = buildIlikeConditions(
        keywords,
        ['title', 'content'],
        1
      );
      sql = `
        SELECT id, section, title, content, tags,
               COALESCE(source_url, NULL) AS source_url
        FROM company_knowledge
        WHERE is_active = true
          AND (
            ${conditions}
            OR tags && $${nextIndex}::text[]
          )
        ORDER BY updated_at DESC
        LIMIT $${nextIndex + 1}
      `;
      result = await query(sql, [...params, toPgArray(keywords), limit]);

      if (result.rowCount === 0) {
        isFallback = true;
        sql = `
          SELECT id, section, title, content, tags,
                 COALESCE(source_url, NULL) AS source_url
          FROM company_knowledge
          WHERE is_active = true
          ORDER BY updated_at DESC
          LIMIT $1
        `;
        result = await query(sql, [limit]);
      }
    }

    logSearchDebug('company_knowledge', keywords, result.rowCount, sql, isFallback);
    return result.rows;
  } catch (err) {
    console.error('[RAG ERROR] Company knowledge search failed:', err.message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// getRecommendation
// ---------------------------------------------------------------------------
async function getRecommendation(need) {
  try {
    const matches = await searchInsuranceProducts(need, 5);

    if (matches.length > 0) {
      return {
        category:        matches[0].category || 'General',
        description:     matches[0].description || '',
        matchedProducts: matches.map(m => ({
          id:           m.id,
          category:     m.category,
          sub_category: m.sub_category,
          description:  m.description,
          benefits:     m.benefits,
          source_url:   m.source_url || null,
        })),
        suggestion: 'Based on your interest, here are products that match your needs.',
      };
    }

    return {
      category:        'General',
      matchedProducts: [],
      description:     'No direct product match found in the database.',
      suggestion:      "Tell me a bit more about what you're looking for and I'll search our products.",
    };
  } catch (err) {
    console.error('getRecommendation error:', err.message);
    return {
      category: 'General', matchedProducts: [], description: 'Error searching products',
      suggestion: 'Please try again later.',
    };
  }
}

// ---------------------------------------------------------------------------
// getQuickFact — static fallback
// ---------------------------------------------------------------------------
async function getQuickFact(topic) {
  const facts = {
    history: 'CIC was founded in 1968 as a department of Kenya National Federation of Cooperatives and incorporated in 1978.',
    contact: 'Reach us at +254 20 2823000, info@cicinsurancegroup.com, or visit any of our 25+ branches.',
  };

  const lowerTopic = (topic || '').toLowerCase();
  for (const [key, value] of Object.entries(facts)) {
    if (lowerTopic.includes(key)) return value;
  }

  return "CIC Insurance Group is Kenya's leading cooperative insurer. How can I help you today?";
}

module.exports = {
  searchFAQ,
  getProducts,
  findBranches,
  getRecommendation,
  searchCompanyKnowledge,
  searchInsuranceProducts,
  getQuickFact,
};
