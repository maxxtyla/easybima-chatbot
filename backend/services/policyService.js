const { query } = require('../config/database');

/**
 * Search FAQ entries by keywords
 * @param {string} searchQuery - User's search query
 * @param {number} limit - Max results
 * @returns {Promise<Array>} - Matching FAQ entries
 */
async function searchFAQ(searchQuery, limit = 3) {
  try {
    // Simple keyword matching (can be enhanced with full-text search)
    const keywords = searchQuery.toLowerCase().split(/\s+/).filter(w => w.length > 2);

    if (keywords.length === 0) {
      return [];
    }

    // Search in question, answer, and keywords
    const result = await query(
      `
        SELECT *, 
          (
            (CASE WHEN question ILIKE $1 THEN 3 ELSE 0 END) +
            (CASE WHEN answer ILIKE $1 THEN 2 ELSE 0 END) +
            (CASE WHEN keywords && $2::text[] THEN 2 ELSE 0 END)
          ) as relevance
        FROM faq_entries
        WHERE is_active = true
          AND (question ILIKE $1 OR answer ILIKE $1 OR keywords && $2::text[])
        ORDER BY relevance DESC, priority DESC
        LIMIT $3
      `,
      [`%${keywords.join('%')}%`, keywords, limit]
    );

    return result.rows;

  } catch (err) {
    console.error('FAQ search error:', err);
    return [];
  }
}

/**
 * Get product information
 * @param {string} category - Product category
 * @param {string} subsidiary - Subsidiary name
 * @returns {Promise<Array>} - Product details
 */
async function getProducts(category = null, subsidiary = null) {
  try {
    let sql = 'SELECT * FROM products WHERE is_active = true';
    const params = [];
    let paramIndex = 1;

    if (category) {
      sql += ` AND category ILIKE $${paramIndex}`;
      params.push(`%${category}%`);
      paramIndex++;
    }

    if (subsidiary) {
      sql += ` AND subsidiary ILIKE $${paramIndex}`;
      params.push(`%${subsidiary}%`);
    }

    sql += ' ORDER BY category, name';

    const result = await query(sql, params);
    return result.rows;

  } catch (err) {
    console.error('Product query error:', err);
    return [];
  }
}

/**
 * Find nearest branches
 * @param {string} city - City name
 * @returns {Promise<Array>} - Branch details
 */
async function findBranches(city = null) {
  try {
    let sql = 'SELECT * FROM branches WHERE is_active = true';
    const params = [];

    if (city) {
      sql += ' AND city ILIKE $1';
      params.push(`%${city}%`);
    }

    sql += ' ORDER BY city, name';

    const result = await query(sql, params);
    return result.rows;

  } catch (err) {
    console.error('Branch query error:', err);
    return [];
  }
}
async function searchCompanyKnowledge(searchQuery, limit = 3) {
  try {
    const keywords = searchQuery.toLowerCase().split(/\W+/).filter(Boolean);
    if (keywords.length === 0) return [];

    const result = await query(
      `
      SELECT *
      FROM company_knowledge
      WHERE is_active = true
        AND (
          title ILIKE $1
          OR content ILIKE $1
          OR tags && $2::text[]
        )
      ORDER BY updated_at DESC
      LIMIT $3
      `,
      [`%${keywords.join('%')}%`, keywords, limit]
    );

    return result.rows;
  } catch (err) {
    console.error('Company knowledge search error:', err);
    return [];
  }
}
/**
 * Get product recommendation based on user needs
 * @param {string} need - User's stated need
 * @returns {Promise<Object>} - Recommended products
 */
async function getRecommendation(need) {
  const lowerNeed = need.toLowerCase();

  // Simple keyword-based recommendation logic
  const recommendations = {
     motor: {
      category: 'Motor',
      products: ['Private Motor Comprehensive', 'Commercial Motor'],
      description: "Protect your vehicle with our comprehensive motor insurance.",
    },
    car: {
      category: 'Motor',
      products: ['Private Motor Comprehensive'],
      description: "Get full coverage for your car including accident, theft, and third-party liability.",
    },
    medical: {
      category: 'Medical',
      products: ['Family Medisure'],
      description: "Comprehensive health coverage for you and your family.",
    },
    health: {
      category: 'Medical',
      products: ['Family Medisure'],
      description: "Quality healthcare coverage with inpatient, outpatient, and maternity benefits.",
    },
    life: {
      category: 'Life',
      products: ['Term Life', 'Whole Life'],
      description: "Secure your family's future with our life assurance products.",
    },
    retirement: {
      category: 'Retirement',
      products: ['Jipange for Retirement'],
      description: "Plan for a comfortable retirement with flexible pension options.",
    },
    pension: {
      category: 'Retirement',
      products: ['Jipange for Retirement'],
      description: "Build your retirement nest egg with tax-efficient pension plans.",
    },
    education: {
      category: 'Education',
      products: ['CIC Academia'],
      description: "Save for your children education with guaranteed benefits.",
    },
    school: {
      category: 'Education',
      products: ['CIC Academia'],
      description: "Education savings plans to secure your child's academic future.",
    },
    investment: {
      category: 'Investment',
      products: ['CIC Money Market Fund', 'Unit Trusts'],
      description: "Grow your wealth with professional fund management.",
    },
    save: {
      category: 'Investment',
      products: ['CIC Money Market Fund'],
      description: "Start with our Money Market Fund - low risk, daily liquidity, competitive returns.",
    },
    agriculture: {
      category: 'Agriculture',
      products: ['Crop Insurance', 'Livestock Insurance'],
      description: "Protect your farm against weather risks, pests, and diseases.",
    },
    farm: {
      category: 'Agriculture',
      products: ['Crop Insurance', 'Livestock Insurance'],
      description: "Comprehensive agricultural insurance for crops and livestock.",
    },
    home: {
      category: 'Property',
      products: ['Homeowners Insurance'],
      description: "Protect your home and belongings against fire, theft, and natural disasters.",
    },
    house: {
      category: 'Property',
      products: ['Homeowners Insurance'],
      description: "Home insurance covering building structure and household contents.",
    },
    travel: {
      category: 'Travel',
      products: ['Travel Insurance'],
      description: "Comprehensive travel coverage including medical emergencies and trip cancellation.",
    },

  };  // Find matching recommendation
  for (const [key, value] of Object.entries(recommendations)) {
    if (lowerNeed.includes(key)) {
      const products = await getProducts(value.category);
      return {
        ...value,
        matchedProducts: products,
        suggestion: `Based on your interest in ${key}, I recommend:`,
      };
    }
  }

  // Default: return popular products
  return {
    category: 'General',
    products: ['Family Medisure', 'Private Motor Comprehensive', 'Jipange for Retirement'],
    description: 'Here are our most popular products that might interest you:',
    matchedProducts: [],
    suggestion: "I can help you find the right cover. Could you tell me more about what you're looking for?",
  };
}

/**
 * Get quick facts about CIC
 * @param {string} topic - Topic of interest
 * @returns {Promise<string>} - Fact or information
 */
async function getQuickFact(topic) {
  const facts = {
    history: "CIC was founded in 1968 as a department of Kenya National Federation of Cooperatives and incorporated in 1978. We've been keeping our word for over 55 years.",
    customers: "CIC serves over 1 million policyholders across Kenya, Uganda, South Sudan, and Malawi.",
    awards: "CIC has won multiple awards including AKI Group Life Company of the Year (since 2015), Best Motor Insurer 2020, and 5 awards at the 2023 AKI Awards.",
    financial: "In 2024, CIC reported KSh 3.99 billion profit before tax (+57% YoY) and KSh 26.3 billion insurance revenue.",
    cooperative: "As a cooperative insurer, CIC is owned by our members. Our mission is to provide financial security through the cooperative spirit.",
    digital: "Easy Bima is our digital platform for instant quotes, paperless coverage, and quick claims. Access it at easybima.cicinsurancegroup.com",
    contact: "Reach us at +254 20 2823000, info@cicinsurancegroup.com, or visit any of our 25+ branches.",
  };

  const lowerTopic = topic.toLowerCase();

  for (const [key, value] of Object.entries(facts)) {
    if (lowerTopic.includes(key)) {
      return value;
    }
  }

  return "CIC Insurance Group is Kenya's leading cooperative insurer. How can I help you today?";
}

module.exports = {
  searchFAQ,
  getProducts,
  findBranches,
  getRecommendation,
  searchCompanyKnowledge,
  getQuickFact,
};