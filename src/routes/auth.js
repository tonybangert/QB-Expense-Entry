// src/routes/auth.js
// Authentication routes: JWT login + QuickBooks OAuth 2.0 flow

const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const router = express.Router();
const qbService = require('../services/quickbooks');
const logger = require('../utils/logger');
const { getUserByUsername, recordUserLogin } = require('../db');
const authenticate = require('../middleware/authenticate');
const { auditLog } = require('../middleware/audit-log');

// OAuth state store: Map<state, { createdAt }> with 10-min expiry
const oauthStates = new Map();

// Clean up expired states every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [state, data] of oauthStates) {
    if (data.createdAt < cutoff) oauthStates.delete(state);
  }
}, 5 * 60 * 1000);

/**
 * POST /api/auth/login
 * Public endpoint — validate credentials, return JWT
 */
router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const user = getUserByUsername(username);
  if (!user) {
    auditLog('login_failed', { username, reason: 'user_not_found', ip: req.ip });
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    auditLog('login_failed', { username, reason: 'bad_password', ip: req.ip });
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { userId: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRY || '8h' }
  );

  recordUserLogin(user.id);
  auditLog('login_success', { user_id: user.id, username: user.username, ip: req.ip });

  res.json({
    token,
    user: { id: user.id, username: user.username, role: user.role },
  });
});

/**
 * GET /api/auth/callback
 * OAuth callback — Intuit redirects here after user authorizes
 * Public (Intuit redirects the browser here)
 */
router.get('/callback', async (req, res) => {
  const { code, state, realmId } = req.query;

  if (!code || !realmId) {
    logger.error('OAuth callback missing code or realmId', { query: req.query });
    return res.status(400).json({
      error: 'Authorization failed',
      message: 'Missing authorization code or company ID from Intuit',
    });
  }

  // Validate the OAuth state to prevent CSRF
  if (!state || !oauthStates.has(state)) {
    auditLog('oauth_callback_invalid_state', { state, ip: req.ip });
    return res.status(400).json({
      error: 'Invalid or expired OAuth state',
      message: 'Please restart the connection flow at /api/auth/connect',
    });
  }
  oauthStates.delete(state);

  try {
    await qbService.exchangeCodeForTokens(code, realmId);
    const companyInfo = await qbService.testConnection();

    auditLog('oauth_connected', {
      company: companyInfo.CompanyName,
      realmId,
      ip: req.ip,
    });

    res.json({
      success: true,
      message: 'QuickBooks connected successfully!',
      company: {
        name: companyInfo.CompanyName,
        id: realmId,
        country: companyInfo.Country,
      },
    });
  } catch (error) {
    logger.error('OAuth token exchange failed:', error);
    auditLog('oauth_exchange_failed', { error: error.message, ip: req.ip });
    res.status(500).json({
      error: 'Connection failed',
      message: error.message,
    });
  }
});

// ── Protected routes below ─────────────────────

/**
 * GET /api/auth/connect
 * Initiates the OAuth flow — redirects user to Intuit login
 */
router.get('/connect', authenticate, (req, res) => {
  const state = crypto.randomBytes(32).toString('hex');
  oauthStates.set(state, { createdAt: Date.now() });

  const authUrl = qbService.getAuthorizationUrl(state);

  auditLog('oauth_initiated', {
    user_id: req.user.userId,
    username: req.user.username,
  });

  res.json({ authUrl });
});

/**
 * GET /api/auth/status
 * Check current QuickBooks connection status
 */
router.get('/status', authenticate, async (req, res) => {
  try {
    const connected = await qbService.isConnected();

    if (connected) {
      const companyInfo = await qbService.testConnection();
      res.json({
        connected: true,
        company: companyInfo.CompanyName,
        environment: process.env.QB_ENVIRONMENT || 'sandbox',
      });
    } else {
      res.json({
        connected: false,
        message: 'Not connected. Visit /api/auth/connect to authorize.',
      });
    }
  } catch (error) {
    res.json({ connected: false, error: error.message });
  }
});

/**
 * POST /api/auth/disconnect
 * Revoke tokens and disconnect from QuickBooks
 */
router.post('/disconnect', authenticate, async (req, res) => {
  try {
    const TokenStore = require('../utils/token-store');
    const store = new TokenStore();
    await store.clear();

    auditLog('oauth_disconnected', {
      user_id: req.user.userId,
      username: req.user.username,
    });

    res.json({ success: true, message: 'Disconnected from QuickBooks.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
