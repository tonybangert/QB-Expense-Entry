#!/usr/bin/env node
// scripts/setup-db.js
// Initialize the SQLite database and verify the schema

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Importing db.js triggers schema creation automatically
const { db } = require('../src/db');

// Verify all tables exist
const expectedTables = ['receipts', 'users', 'api_keys'];
const tables = db.prepare(
  "SELECT name FROM sqlite_master WHERE type='table'"
).all().map(r => r.name);

const missing = expectedTables.filter(t => !tables.includes(t));
if (missing.length > 0) {
  console.error(`ERROR: Missing tables: ${missing.join(', ')}`);
  process.exit(1);
}

console.log('Database setup complete!');
console.log(`  Path: ${db.name}`);
for (const table of expectedTables) {
  const count = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get();
  console.log(`  Table: ${table} (${count.count} rows)`);
}
