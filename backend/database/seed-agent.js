//
// One-off CLI to create/update a staff agent account. Staff accounts are
// provisioned by whoever administers this system — there is deliberately
// no public signup form for the ticketing dashboard.
//
// Usage:
//   node database/seed-agent.js \
//     --staffNo=CIC1042 --name="Jane Wanjiru" --email=jane.wanjiru@cic.co.ke \
//     --password='TempPass123!' --role=agent --department="Customer Care"
//
// Re-running with the same email updates name/role/password (useful for
// resets) rather than erroring on conflict.

require('dotenv').config();
const { pool } = require('../config/database');
const { hashPassword } = require('../services/agentAuthService');

function parseArgs() {
  const args = {};
  for (const raw of process.argv.slice(2)) {
    const match = raw.match(/^--([^=]+)=(.*)$/);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

async function main() {
  const { staffNo, name, email, password, role = 'agent', department, branchId } = parseArgs();

  if (!staffNo || !name || !email || !password) {
    console.error('Missing required args. Example:');
    console.error('  node database/seed-agent.js --staffNo=CIC1042 --name="Jane Wanjiru" --email=jane@cic.co.ke --password=\'TempPass123!\' --role=agent');
    process.exit(1);
  }

  if (!['agent', 'supervisor', 'admin'].includes(role)) {
    console.error(`Invalid role "${role}". Must be agent, supervisor, or admin.`);
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);

  await pool.query(
    `INSERT INTO agents (staff_no, full_name, email, password_hash, role, department, branch_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (email) DO UPDATE
       SET full_name = EXCLUDED.full_name,
           password_hash = EXCLUDED.password_hash,
           role = EXCLUDED.role,
           department = EXCLUDED.department,
           branch_id = EXCLUDED.branch_id,
           updated_at = NOW()`,
    [staffNo, name, email.toLowerCase().trim(), passwordHash, role, department || null, branchId || null]
  );

  console.log(`✅ Agent ready: ${email} (${role})`);
  await pool.end();
}

main().catch((error) => {
  console.error('❌ Failed to seed agent:', error);
  process.exit(1);
});
