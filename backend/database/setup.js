require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');

async function setupDatabase() {
  try {
    console.log('🚀 Setting up EasyBima database...');

    // Read schema file
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    // Execute schema
    console.log('📝 Creating tables...');
    await pool.query(schema);
    console.log('✅ Tables created successfully');

    // Seed sample data
    console.log('🌱 Seeding sample data...');

    // FAQs
    const faqs = [
      {
        question: 'What are the main insurance products offered by CIC?',
        answer: 'CIC offers Motor Insurance, Medical Insurance (Family Medisure), Agriculture Insurance, Marine & Aviation, Property & Home Insurance, and Liability & Engineering Covers through our Easy Bima digital platform.',
      },
      {
        question: 'How do I file a claim?',
        answer: 'To file a claim, contact our customer care team at +254 20 2823000 or visit any of our 25+ branches across Kenya. You can also use our Easy Bima platform for quick claim submissions.',
      },
      {
        question: 'Where are CIC branches located?',
        answer: 'We have 25+ branches across Kenya including Nairobi (Upper Hill HQ), Mombasa, Kisumu, Nakuru, Eldoret, and many more. Visit our website or call us for the nearest branch.',
      },
      {
        question: 'What payment methods do you accept?',
        answer: 'We accept M-Pesa, bank transfers, agent payments, and card payments. Easy Bima allows instant online payments for quick coverage.',
      },
      {
        question: 'What is the Easy Bima platform?',
        answer: 'Easy Bima is our digital platform that allows you to get instant insurance quotes, purchase policies online, and manage claims paperlessly. It is available on mobile and web.',
      },
    ];

    for (const faq of faqs) {
      await pool.query(
        'INSERT INTO faqs (question, answer) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [faq.question, faq.answer]
      );
    }
    console.log('✅ FAQs seeded');

    // Products
    const products = [
      {
        name: 'Motor Insurance',
        description: 'Comprehensive coverage for private and commercial vehicles',
        category: 'General Insurance',
        key_features: JSON.stringify(['Third party liability', 'Own damage', 'Personal accident']),
      },
      {
        name: 'Family Medisure',
        description: 'Medical insurance for families with comprehensive health coverage',
        category: 'Medical Insurance',
        key_features: JSON.stringify(['Hospital cover', 'Outpatient benefits', 'Dental coverage']),
      },
      {
        name: 'Jipange Retirement Plan',
        description: 'Pension and retirement savings plan for secure future',
        category: 'Life Assurance',
        key_features: JSON.stringify(['Retirement income', 'Death benefit', 'Tax efficiency']),
      },
      {
        name: 'Unit Trust Fund',
        description: 'Investment opportunity in diversified portfolios',
        category: 'Asset Management',
        key_features: JSON.stringify(['Diversification', 'Professional management', 'Growth potential']),
      },
    ];

    for (const product of products) {
      await pool.query(
        'INSERT INTO products (name, description, category, key_features) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
        [product.name, product.description, product.category, product.key_features]
      );
    }
    console.log('✅ Products seeded');

    // Branches
    const branches = [
      {
        name: 'CIC Plaza - Headquarters',
        address: 'Mara Road, Upper Hill',
        city: 'Nairobi',
        phone: '+254 20 2823000',
      },
      {
        name: 'Mombasa Branch',
        address: 'Nkrumah Road, City Centre',
        city: 'Mombasa',
        phone: '+254 41 2222222',
      },
      {
        name: 'Kisumu Branch',
        address: 'Oginga Odinga Street',
        city: 'Kisumu',
        phone: '+254 57 2022222',
      },
      {
        name: 'Nakuru Branch',
        address: 'Kenyatta Avenue',
        city: 'Nakuru',
        phone: '+254 51 2100000',
      },
      {
        name: 'Eldoret Branch',
        address: 'Uganda Road',
        city: 'Eldoret',
        phone: '+254 53 2063000',
      },
    ];

    for (const branch of branches) {
      await pool.query(
        'INSERT INTO branches (name, address, city, phone) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
        [branch.name, branch.address, branch.city, branch.phone]
      );
    }
    console.log('✅ Branches seeded');

    console.log('\n✨ Database setup completed successfully!');
    console.log('📊 Database is ready for use');
    process.exit(0);
  } catch (error) {
    console.error('❌ Database setup failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

setupDatabase();