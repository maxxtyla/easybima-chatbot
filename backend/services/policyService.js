const { query } = require('../config/database');

// ---------------------------------------------------------------------------
// Helper — builds individual ILIKE conditions from a keyword array so that
// each word is matched independently instead of being joined into one broken
// pattern like "%what%insurance%products%you%offer%".
//
// Returns: { conditions: string, params: any[], nextIndex: number }
// ---------------------------------------------------------------------------
function buildIlikeConditions(keywords, columns, startIndex = 1) {
  // One $N per keyword, reused across all columns via the same param index
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
// Helper — wraps a plain JS array into the Postgres literal "{a,b,c}" that
// the pg driver accepts for text[] parameters without needing casting tricks.
// ---------------------------------------------------------------------------
function toPgArray(arr) {
  if (!arr || arr.length === 0) return '{}';
  const escaped = arr.map(v => `"${String(v).replace(/"/g, '\\"')}"`);
  return `{${escaped.join(',')}}`;
}

// ---------------------------------------------------------------------------
// searchFAQ
// ---------------------------------------------------------------------------
async function searchFAQ(searchQuery, limit = 5) {
  try {
    const keywords = searchQuery
      .toLowerCase()
      .split(/\W+/)
      .filter(w => w.length > 2);

    if (keywords.length === 0) return [];

    // Build per-keyword ILIKE conditions for question + answer columns
    const { conditions, params, nextIndex } = buildIlikeConditions(
      keywords,
      ['question', 'answer'],
      1
    );

    // $nextIndex = pg array for keyword-array overlap check
    // $nextIndex+1 = limit
    const sql = `
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

    const result = await query(sql, [...params, toPgArray(keywords), limit]);
    return result.rows;
  } catch (err) {
    console.error('FAQ search error:', err.message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// searchInsuranceProducts
// ---------------------------------------------------------------------------
async function searchInsuranceProducts(searchQuery, limit = 5) {
  try {
    const keywords = searchQuery
      .toLowerCase()
      .split(/\W+/)
      .filter(w => w.length > 2);

    if (keywords.length === 0) return [];

    const { conditions, params, nextIndex } = buildIlikeConditions(
      keywords,
      ['category', 'sub_category', 'description', 'benefits'],
      1
    );

    const sql = `
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

    const result = await query(sql, [...params, toPgArray(keywords), limit]);
    return result.rows;
  } catch (err) {
    console.error('Insurance products search error:', err.message);
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
    // Check once whether source_url exists on this DB instance
    const colCheck = await query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_name = 'branches' AND column_name = 'source_url'
       LIMIT 1`
    );
    const hasSourceUrl = colCheck.rows.length > 0;

    const sourceUrlCol = hasSourceUrl
      ? 'source_url'
      : "NULL::text AS source_url";

    let sql = `
      SELECT id, name, phone, address, region, city,
             ${sourceUrlCol}
      FROM branches
      WHERE is_active = true
    `;
    const params = [];

    if (city) {
      sql += ' AND (city ILIKE $1 OR region ILIKE $1 OR address ILIKE $1)';
      params.push(`%${city}%`);
    }

    sql += ' ORDER BY region, name';

    const result = await query(sql, params);
    return result.rows;
  } catch (err) {
    console.error('Branch query error:', err.message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// searchCompanyKnowledge
// ---------------------------------------------------------------------------
async function searchCompanyKnowledge(searchQuery, limit = 3) {
  try {
    const keywords = searchQuery
      .toLowerCase()
      .split(/\W+/)
      .filter(w => w.length > 2);

    if (keywords.length === 0) return [];

    const { conditions, params, nextIndex } = buildIlikeConditions(
      keywords,
      ['title', 'content'],
      1
    );

    const sql = `
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

    const result = await query(sql, [...params, toPgArray(keywords), limit]);
    return result.rows;
  } catch (err) {
    console.error('Company knowledge search error:', err.message);
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