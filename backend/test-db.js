require('dotenv').config();
const { pool } = require('./config/database');

async function testConnection() {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('✅ Database connected successfully!');
    console.log('Current time:', result.rows[0].now);
    process.exit(0);
  } catch (error) {
    console.error('❌ Database connection failed:');
    console.error(error.message);
    console.error('Hostname:', process.env.DB_HOST);
    console.error('Port:', process.env.DB_PORT);
    console.error('Database:', process.env.DB_NAME);
    process.exit(1);
  }
}

testConnection();