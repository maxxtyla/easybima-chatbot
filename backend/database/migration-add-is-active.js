/**
 * Migration: Add missing is_active columns to products and branches
 */

const { pool } = require('../config/database');

async function runMigration() {
  const client = await pool.connect();

  try {
    console.log('🔧 Adding missing is_active columns...\n');

    // Check if products table has is_active
    const productsCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'products' 
      AND column_name = 'is_active';
    `);

    if (productsCheck.rows.length === 0) {
      console.log('➕ Adding is_active to products table...');
      await client.query(`
        ALTER TABLE products 
        ADD COLUMN is_active BOOLEAN DEFAULT true;
      `);
      console.log('✅ is_active added to products table\n');
    } else {
      console.log('⏭️  products.is_active already exists\n');
    }

    // Check if branches table has is_active
    const branchesCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'branches' 
      AND column_name = 'is_active';
    `);

    if (branchesCheck.rows.length === 0) {
      console.log('➕ Adding is_active to branches table...');
      await client.query(`
        ALTER TABLE branches 
        ADD COLUMN is_active BOOLEAN DEFAULT true;
      `);
      console.log('✅ is_active added to branches table\n');
    } else {
      console.log('⏭️  branches.is_active already exists\n');
    }

    console.log('✨ Migration completed successfully!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    client.release();
  }
}

runMigration();
