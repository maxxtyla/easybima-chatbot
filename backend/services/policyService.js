const { query } = require('../config/database');

/**
 * Search FAQ entries by keywords
 */
async function searchFAQ(searchQuery, limit = 3) {
  try {
    const keywords = searchQuery.toLowerCase().split(/\W+/).filter(w => w.length > 2);
    if (keywords.length === 0) return [];

    const result = await query(
      `
      SELECT id, category, question, answer, keywords, priority,
             -- source_url added by migration; coalesce guards legacy DBs
             COALESCE(source_url, NULL) AS source_url
      FROM faq_entries
      WHERE is_active = true
        AND (
          question ILIKE $1
          OR answer   ILIKE $1
          OR keywords && $2::text[]
        )
      ORDER BY priority DESC
      LIMIT $3
      `,
      [`%${keywords.join('%')}%`, keywords, limit]
    );

    return result.rows;
  } catch (err) {
    console.error('FAQ search error:', err.message);
    return [];
  }
}

/**
 * Search insurance products
 */
async function searchInsuranceProducts(searchQuery, limit = 5) {
  try {
    const keywords = searchQuery.toLowerCase().split(/\W+/).filter(Boolean);
    if (keywords.length === 0) return [];

    const result = await query(
      `
      SELECT id, category, sub_category, description, benefits, keywords,
             COALESCE(source_url, NULL) AS source_url
      FROM insurance_products
      WHERE is_active = true
        AND (
          category     ILIKE $1
          OR sub_category ILIKE $1
          OR description  ILIKE $1
          OR benefits     ILIKE $1
          OR keywords && $2::text[]
        )
      ORDER BY category, sub_category
      LIMIT $3
      `,
      [`%${keywords.join('%')}%`, keywords, limit]
    );

    return result.rows;
  } catch (err) {
    console.error('Insurance products search error:', err.message);
    return [];
  }
}

/**
 * Get all products (backwards-compatible)
 */
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

/**
 * Find branches by city/region
 */
async function findBranches(city = null) {
  try {
    // Select explicit columns — source_url included after migration
    let sql = `
      SELECT id, name, phone, address, region, city,
             COALESCE(source_url, NULL) AS source_url
      FROM branches
      WHERE is_active = true
    `;
    const params = [];

    if (city) {
      sql += ' AND (city ILIKE $1 OR region ILIKE $1)';
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

/**
 * Search company knowledge base
 */
async function searchCompanyKnowledge(searchQuery, limit = 3) {
  try {
    const keywords = searchQuery.toLowerCase().split(/\W+/).filter(Boolean);
    if (keywords.length === 0) return [];

    const result = await query(
      `
      SELECT id, section, title, content, tags,
             COALESCE(source_url, NULL) AS source_url
      FROM company_knowledge
      WHERE is_active = true
        AND (
          title   ILIKE $1
          OR content ILIKE $1
          OR tags  && $2::text[]
        )
      ORDER BY updated_at DESC
      LIMIT $3
      `,
      [`%${keywords.join('%')}%`, keywords, limit]
    );

    return result.rows;
  } catch (err) {
    console.error('Company knowledge search error:', err.message);
    return [];
  }
}

/**
 * Get product recommendation from DB search
 */
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

/**
 * Static quick facts fallback
 */
async function getQuickFact(topic) {
  const facts = {
    history: "CIC was founded in 1968 as a department of Kenya National Federation of Cooperatives and incorporated in 1978.",
    contact: "Reach us at +254 20 2823000, info@cicinsurancegroup.com, or visit any of our 25+ branches.",
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