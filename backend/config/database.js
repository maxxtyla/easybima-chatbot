require('dotenv').config();
const { Pool } = require('pg');

// Validate required environment variables
const requiredEnvVars = ['DB_HOST', 'DB_USER', 'DB_NAME'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missingEnvVars.join(', ')}\n` +
    `Please create a .env file with all required variables.`
  );
}

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD || '',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Handle pool errors
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

// Test connection
const testConnection = async () => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    console.log('✅ Database connected successfully at:', result.rows[0].now);
    client.release();
    return true;
  } catch (err) {
    console.error('❌ Database connection failed:', err.message);
    return false;
  }
};

// Query helper
//
// Logging policy: query TEXT (the SQL statement shape) is safe to log —
// it's always parameterized ($1, $2...) in this codebase, never raw
// values. Query PARAMS are NOT safe to log — they can carry customer
// messages, phone numbers, emails, or ticket notes. We log query shape +
// timing always (cheap, useful for perf debugging), but only log params
// when explicitly opted into via DB_LOG_PARAMS=true, and only outside
// production even then — this mirrors the same "never let sensitive
// content leak into logs" posture as sanitizeResponse.js's CoT handling.
const SHOULD_LOG_QUERIES = process.env.NODE_ENV !== 'production' || process.env.DB_QUERY_LOGGING === 'true';
const SHOULD_LOG_PARAMS = process.env.DB_LOG_PARAMS === 'true' && process.env.NODE_ENV !== 'production';

const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (SHOULD_LOG_QUERIES) {
      const logPayload = { text: text.replace(/\s+/g, ' ').trim().substring(0, 80), duration, rows: result.rowCount };
      if (SHOULD_LOG_PARAMS) logPayload.params = params;
      console.log('Executed query', logPayload);
    }
    return result;
  } catch (err) {
    // Error logging deliberately omits `params` for the same reason —
    // an error log is exactly the kind of place PII silently ends up
    // getting shipped to log aggregators/Sentry with no one noticing.
    console.error('Query error:', {
      message: err.message,
      code: err.code,
      text: text.substring(0, 80),
      stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
    });
    throw err;
  }
};

// Transaction helper
const transaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// Fix: single export - removed the duplicate mid-file `module.exports = { pool }`
module.exports = {
  pool,
  query,
  transaction,
  testConnection,
};