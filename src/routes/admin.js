// src/routes/admin.js
// API key management and admin endpoints

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { createApiKey, getApiKeysByUser, revokeApiKey } = require('../db');
const { auditLog } = require('../middleware/audit-log');

/**
 * GET /api/admin/me
 * Return current authenticated user info
 */
router.get('/me', (req, res) => {
  res.json({
    userId: req.user.userId,
    username: req.user.username,
    role: req.user.role,
    authMethod: req.user.authMethod,
  });
});

/**
 * GET /api/admin/api-keys
 * List API keys for the current user (prefix + label only, never the full key)
 */
router.get('/api-keys', (req, res) => {
  const keys = getApiKeysByUser(req.user.userId);
  res.json({ keys });
});

/**
 * POST /api/admin/api-keys
 * Create a new API key. Returns the full key exactly once.
 */
router.post('/api-keys', (req, res) => {
  const { label } = req.body || {};
  const keyLabel = (label || 'default').substring(0, 100);

  // Generate a random API key with a recognizable prefix
  const rawKey = `qbx_${crypto.randomBytes(32).toString('hex')}`;
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  const keyPrefix = rawKey.substring(0, 8);

  const record = createApiKey(req.user.userId, keyHash, keyPrefix, keyLabel);

  auditLog('api_key_created', {
    user_id: req.user.userId,
    username: req.user.username,
    key_id: record.id,
    key_prefix: keyPrefix,
    label: keyLabel,
  });

  res.status(201).json({
    id: record.id,
    key: rawKey,
    prefix: keyPrefix,
    label: keyLabel,
    message: 'Store this key securely — it will not be shown again.',
  });
});

/**
 * DELETE /api/admin/api-keys/:id
 * Revoke an API key
 */
router.delete('/api-keys/:id', (req, res) => {
  const keyId = parseInt(req.params.id, 10);
  if (isNaN(keyId)) {
    return res.status(400).json({ error: 'Invalid key ID' });
  }

  const revoked = revokeApiKey(keyId, req.user.userId);
  if (!revoked) {
    return res.status(404).json({ error: 'API key not found or already revoked' });
  }

  auditLog('api_key_revoked', {
    user_id: req.user.userId,
    username: req.user.username,
    key_id: keyId,
  });

  res.json({ success: true, message: 'API key revoked' });
});

module.exports = router;
