const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');

const JWT_SECRET = process.env.STAFF_JWT_SECRET;
const TOKEN_TTL = process.env.STAFF_JWT_TTL || '8h'; // roughly a shift

if (!JWT_SECRET) {
  // Fail loudly at startup, not on the first login attempt — an
  // unset secret would otherwise silently sign tokens with `undefined`.
  throw new Error('STAFF_JWT_SECRET is not set. Add it to backend/.env before starting the server.');
}

const SALT_ROUNDS = 12;

async function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, SALT_ROUNDS);
}

async function verifyPassword(plainPassword, passwordHash) {
  return bcrypt.compare(plainPassword, passwordHash);
}

function signToken(agent) {
  return jwt.sign(
    { sub: agent.id, email: agent.email, role: agent.role, fullName: agent.full_name },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET); // throws on invalid/expired
}

/**
 * @returns {Promise<{ token: string, agent: object } | null>} null on
 * invalid credentials or inactive account — caller should return a
 * generic 401, not distinguish "wrong password" from "no such user".
 */
async function login(email, plainPassword) {
  const result = await pool.query(
    `SELECT * FROM agents WHERE email = $1 AND is_active = true`,
    [email.toLowerCase().trim()]
  );

  const agent = result.rows[0];
  if (!agent) return null;

  const valid = await verifyPassword(plainPassword, agent.password_hash);
  if (!valid) return null;

  const token = signToken(agent);
  const { password_hash, ...safeAgent } = agent;
  return { token, agent: safeAgent };
}

module.exports = {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  login,
};
