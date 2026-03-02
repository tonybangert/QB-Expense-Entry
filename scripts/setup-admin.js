#!/usr/bin/env node
// scripts/setup-admin.js
// Create the initial admin user for JWT authentication
//
// Usage (interactive):
//   node scripts/setup-admin.js
//
// Usage (env vars for CI/scripts):
//   ADMIN_USERNAME=admin ADMIN_PASSWORD=securepass node scripts/setup-admin.js

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const bcrypt = require('bcrypt');
const { createUser, getUserByUsername } = require('../src/db');

const SALT_ROUNDS = 12;

async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   QB Expense Agent — Admin Setup         ║');
  console.log('╚══════════════════════════════════════════╝\n');

  let username = process.env.ADMIN_USERNAME;
  let password = process.env.ADMIN_PASSWORD;

  if (!username || !password) {
    // Interactive mode — read from stdin
    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

    username = await ask('Admin username: ');
    password = await ask('Admin password: ');
    rl.close();
  }

  if (!username || username.length < 3) {
    console.error('ERROR: Username must be at least 3 characters.');
    process.exit(1);
  }
  if (!password || password.length < 8) {
    console.error('ERROR: Password must be at least 8 characters.');
    process.exit(1);
  }

  // Check if user already exists
  const existing = getUserByUsername(username);
  if (existing) {
    console.error(`ERROR: User "${username}" already exists.`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = createUser(username, passwordHash, 'admin');

  console.log(`\n✓ Admin user created successfully!`);
  console.log(`  Username: ${user.username}`);
  console.log(`  Role:     ${user.role}`);
  console.log(`  ID:       ${user.id}`);
  console.log(`\nYou can now log in with POST /api/auth/login`);
}

main().catch((err) => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
