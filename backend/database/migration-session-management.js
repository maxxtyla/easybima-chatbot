/**
 * Database Migration for Session Management
 * 
 * This migration ensures the conversations table has the required columns
 * for session expiration tracking.
 * 
 * Run with: node database/migration-session-management.js
 */

const { pool } = require('../config/database');

async function runMigration() {
  const client = await pool.connect();

  try {
    console.log('🔧 Starting session management migration...\n');

    // ===== Check if columns exist =====
    const checkColumnsQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'conversations' 
      AND column_name IN ('last_activity_at', 'archived');
    `;

    const existingColumns = await client.query(checkColumnsQuery);
    const columnNames = existingColumns.rows.map(r => r.column_name);

    console.log(`📋 Existing session-related columns: ${columnNames.length > 0 ? columnNames.join(', ') : 'none'}\n`);

    // ===== Add last_activity_at if missing =====
    if (!columnNames.includes('last_activity_at')) {
      console.log('➕ Adding last_activity_at column...');
      await client.query(`
        ALTER TABLE conversations 
        ADD COLUMN last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
      `);
      console.log('✅ last_activity_at column added\n');
    } else {
      console.log('⏭️  last_activity_at column already exists, skipping...\n');
    }

    // ===== Add metadata field to track session state =====
    if (!columnNames.includes('metadata')) {
      console.log('➕ Adding metadata column...');
      await client.query(`
        ALTER TABLE conversations 
        ADD COLUMN metadata JSONB DEFAULT '{}';
      `);
      console.log('✅ metadata column added\n');
    } else {
      console.log('⏭️  metadata column already exists, skipping...\n');
    }

    // ===== Add index for faster expiration queries =====
    const indexCheckQuery = `
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'conversations' 
      AND indexname = 'idx_conversations_last_activity';
    `;

    const indexExists = await client.query(indexCheckQuery);

    if (indexExists.rows.length === 0) {
      console.log('➕ Creating index on last_activity_at...');
      await client.query(`
        CREATE INDEX idx_conversations_last_activity 
        ON conversations(last_activity_at DESC);
      `);
      console.log('✅ Index created for faster queries\n');
    } else {
      console.log('⏭️  Index already exists, skipping...\n');
    }

    // ===== Add trigger to auto-update last_activity_at =====
    const triggerCheckQuery = `
      SELECT trigger_name 
      FROM information_schema.triggers 
      WHERE trigger_name = 'update_last_activity_at';
    `;

    const triggerExists = await client.query(triggerCheckQuery);

    if (triggerExists.rows.length === 0) {
      console.log('➕ Creating trigger for auto-update last_activity_at...');
      await client.query(`
        CREATE OR REPLACE FUNCTION update_last_activity_trigger()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.last_activity_at = NOW();
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        CREATE TRIGGER update_last_activity_at
        BEFORE UPDATE ON conversations
        FOR EACH ROW
        EXECUTE FUNCTION update_last_activity_trigger();
      `);
      console.log('✅ Trigger created\n');
    } else {
      console.log('⏭️  Trigger already exists, skipping...\n');
    }

    // ===== Update existing conversations to have last_activity_at =====
    console.log('🔄 Updating existing conversations...');
    await client.query(`
      UPDATE conversations 
      SET last_activity_at = COALESCE(updated_at, created_at) 
      WHERE last_activity_at IS NULL;
    `);

    const updateResult = await client.query(`SELECT COUNT(*) FROM conversations`);
    console.log(`✅ Updated ${updateResult.rows[0].count} conversations\n`);

    console.log('✨ Migration completed successfully!');
    console.log('\n📊 New Schema:');
    console.log('  • last_activity_at: Tracks last user activity');
    console.log('  • metadata: Stores session state (archived, warningShown, etc.)');
    console.log('  • Trigger: Auto-updates last_activity_at on changes');
    console.log('  • Index: Optimized queries for session expiration checks');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migration
runMigration().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
