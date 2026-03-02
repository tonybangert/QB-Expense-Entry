// src/middleware/authenticate.js
// JWT + API Key authentication middleware

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { getApiKeyByHash, recordApiKeyUsage } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Express middleware: authenticate via JWT Bearer token or X-API-Key header.
 *
 * On success, sets req.user = { userId, username, role, authMethod }.
 * On failure, returns 401.
 *
 * Strategy order:
 *   1. Authorization: Bearer <jwt> — verify signature, extract claims
 *   2. X-API-Key header — SHA-256 hash, look up in api_keys table
 *   3. 401 if neither succeeds
 */
function authenticate(req, res, next) {
  // Strategy 1: JWT Bearer token
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      req.user = {
        userId: payload.userId,
        username: payload.username,
        role: payload.role,
        authMethod: 'jwt',
      };
      return next();
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  }

  // Strategy 2: API key
  const apiKey = req.headers['x-api-key'];
  if (apiKey) {
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
    const record = getApiKeyByHash(keyHash);
    if (record) {
      recordApiKeyUsage(record.id);
      req.user = {
        userId: record.user_id,
        username: record.username,
        role: record.role,
        authMethod: 'api_key',
      };
      return next();
    }
    return res.status(401).json({ error: 'Invalid API key' });
  }

  return res.status(401).json({ error: 'Authentication required' });
}

module.exports = authenticate;
