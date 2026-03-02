// src/db.js
// SQLite database layer using better-sqlite3

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const logger = require('./utils/logger');

const DB_PATH = path.join(__dirname, '../data/expense-agent.db');

// Ensure data directory exists
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─────────────────────────────────────────────
// Schema initialization
// ─────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS receipts (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'extracted',

    -- File info
    original_filename TEXT,
    stored_path TEXT,
    file_size INTEGER,

    -- Extracted fields
    vendor_name TEXT,
    date TEXT,
    total_amount REAL,
    subtotal REAL,
    tax_amount REAL DEFAULT 0,
    tip_amount REAL DEFAULT 0,
    payment_method TEXT,
    currency TEXT DEFAULT 'USD',
    suggested_category TEXT,
    description TEXT,
    overall_confidence REAL,
    field_confidence TEXT,  -- JSON
    notes TEXT,
    line_items_json TEXT,   -- JSON array of line items

    -- Approval / rejection
    rejection_reason TEXT,
    qb_purchase_id TEXT,

    -- Timestamps
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_receipts_status ON receipts(status);
  CREATE INDEX IF NOT EXISTS idx_receipts_created ON receipts(created_at);

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TEXT DEFAULT (datetime('now')),
    last_login TEXT
  );

  CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    key_hash TEXT UNIQUE NOT NULL,
    key_prefix TEXT NOT NULL,
    label TEXT NOT NULL DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    last_used TEXT,
    revoked INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
  CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
`);

// ─────────────────────────────────────────────
// Prepared statements
// ─────────────────────────────────────────────

const insertReceipt = db.prepare(`
  INSERT INTO receipts (
    id, status, original_filename, stored_path, file_size,
    vendor_name, date, total_amount, subtotal, tax_amount, tip_amount,
    payment_method, currency, suggested_category, description,
    overall_confidence, field_confidence, notes, line_items_json
  ) VALUES (
    @id, @status, @original_filename, @stored_path, @file_size,
    @vendor_name, @date, @total_amount, @subtotal, @tax_amount, @tip_amount,
    @payment_method, @currency, @suggested_category, @description,
    @overall_confidence, @field_confidence, @notes, @line_items_json
  )
`);

const selectReceipt = db.prepare(`SELECT * FROM receipts WHERE id = ?`);

const updateStatus = db.prepare(`
  UPDATE receipts
  SET status = @status,
      rejection_reason = @rejection_reason,
      qb_purchase_id = @qb_purchase_id,
      updated_at = datetime('now')
  WHERE id = @id
`);

// ─────────────────────────────────────────────
// CRUD functions
// ─────────────────────────────────────────────

/**
 * Save a new receipt extraction to the database.
 *
 * @param {string} id - Receipt ID (e.g. rcpt_1709123456789)
 * @param {Object} file - File metadata { original_name, stored_path, size }
 * @param {Object} extraction - Extracted data from Claude Vision
 * @returns {Object} The saved receipt row
 */
function saveReceipt(id, file, extraction) {
  insertReceipt.run({
    id,
    status: 'extracted',
    original_filename: file.original_name,
    stored_path: file.stored_path,
    file_size: file.size,
    vendor_name: extraction.vendor_name,
    date: extraction.date,
    total_amount: extraction.total_amount,
    subtotal: extraction.subtotal || null,
    tax_amount: extraction.tax_amount || 0,
    tip_amount: extraction.tip_amount || 0,
    payment_method: extraction.payment_method,
    currency: extraction.currency || 'USD',
    suggested_category: extraction.suggested_category,
    description: extraction.description,
    overall_confidence: extraction.overall_confidence,
    field_confidence: JSON.stringify(extraction.field_confidence || {}),
    notes: extraction.notes,
    line_items_json: JSON.stringify(extraction.line_items || []),
  });

  logger.info(`Receipt saved to database: ${id}`);
  return getReceipt(id);
}

/**
 * Load a receipt by ID, parsing JSON fields back into objects.
 *
 * @param {string} id - Receipt ID
 * @returns {Object|null} Receipt with parsed line_items and field_confidence, or null
 */
function getReceipt(id) {
  const row = selectReceipt.get(id);
  if (!row) return null;
  return deserializeReceipt(row);
}

/**
 * Update a receipt's status (approve or reject).
 *
 * @param {string} id - Receipt ID
 * @param {string} status - New status ('approved' or 'rejected')
 * @param {Object} extras - Optional { rejection_reason, qb_purchase_id }
 * @returns {Object|null} Updated receipt or null if not found
 */
function updateReceiptStatus(id, status, extras = {}) {
  const result = updateStatus.run({
    id,
    status,
    rejection_reason: extras.rejection_reason || null,
    qb_purchase_id: extras.qb_purchase_id || null,
  });

  if (result.changes === 0) return null;

  logger.info(`Receipt ${id} updated to status: ${status}`);
  return getReceipt(id);
}

/**
 * Get receipts awaiting review, ordered by lowest confidence first
 * so the ones needing the most attention surface to the top.
 *
 * @param {Object} opts - Options
 * @param {number} opts.limit - Max rows to return (default 50)
 * @param {number} opts.offset - Rows to skip for pagination (default 0)
 * @returns {{ receipts: Object[], total: number }}
 */
function getPendingReceipts({ limit = 50, offset = 0 } = {}) {
  const total = db.prepare(
    "SELECT COUNT(*) as count FROM receipts WHERE status = 'extracted'"
  ).get().count;

  const rows = db.prepare(
    `SELECT * FROM receipts
     WHERE status = 'extracted'
     ORDER BY overall_confidence ASC, created_at ASC
     LIMIT ? OFFSET ?`
  ).all(limit, offset);

  return {
    receipts: rows.map(deserializeReceipt),
    total,
  };
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function deserializeReceipt(row) {
  return {
    ...row,
    line_items: JSON.parse(row.line_items_json || '[]'),
    field_confidence: JSON.parse(row.field_confidence || '{}'),
  };
}

// ─────────────────────────────────────────────
// User CRUD
// ─────────────────────────────────────────────

function createUser(username, passwordHash, role = 'user') {
  const stmt = db.prepare(
    'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)'
  );
  const result = stmt.run(username, passwordHash, role);
  return getUserById(result.lastInsertRowid);
}

function getUserByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username) || null;
}

function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) || null;
}

function recordUserLogin(id) {
  db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(id);
}

// ─────────────────────────────────────────────
// API Key CRUD
// ─────────────────────────────────────────────

function createApiKey(userId, keyHash, keyPrefix, label = '') {
  const stmt = db.prepare(
    'INSERT INTO api_keys (user_id, key_hash, key_prefix, label) VALUES (?, ?, ?, ?)'
  );
  const result = stmt.run(userId, keyHash, keyPrefix, label);
  return db.prepare('SELECT * FROM api_keys WHERE id = ?').get(result.lastInsertRowid);
}

function getApiKeyByHash(keyHash) {
  return db.prepare(
    'SELECT ak.*, u.username, u.role FROM api_keys ak JOIN users u ON ak.user_id = u.id WHERE ak.key_hash = ? AND ak.revoked = 0'
  ).get(keyHash) || null;
}

function getApiKeysByUser(userId) {
  return db.prepare(
    'SELECT id, key_prefix, label, created_at, last_used, revoked FROM api_keys WHERE user_id = ?'
  ).all(userId);
}

function revokeApiKey(id, userId) {
  const result = db.prepare(
    'UPDATE api_keys SET revoked = 1 WHERE id = ? AND user_id = ?'
  ).run(id, userId);
  return result.changes > 0;
}

function recordApiKeyUsage(id) {
  db.prepare("UPDATE api_keys SET last_used = datetime('now') WHERE id = ?").run(id);
}

module.exports = {
  db,
  saveReceipt,
  getReceipt,
  updateReceiptStatus,
  getPendingReceipts,
  createUser,
  getUserByUsername,
  getUserById,
  recordUserLogin,
  createApiKey,
  getApiKeyByHash,
  getApiKeysByUser,
  revokeApiKey,
  recordApiKeyUsage,
};
