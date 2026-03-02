// src/index.js
// QB Expense Agent — Main server entry point

require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const logger = require('./utils/logger');
const authenticate = require('./middleware/authenticate');
const { requestAuditMiddleware } = require('./middleware/audit-log');

const clientDist = path.join(__dirname, '..', 'client', 'dist');
const clientIndex = path.join(clientDist, 'index.html');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy when behind a reverse proxy (Cloudflare Tunnel, nginx, etc.)
app.set('trust proxy', 1);

// ─── 1. Security headers ───────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// ─── 2. Rate limiting ──────────────────────────
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Try again later.' },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again later.' },
});

app.use(generalLimiter);

// ─── 3. CORS — whitelist from env ──────────────
const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS
  ? process.env.CORS_ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : [];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, curl, etc.)
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

// ─── 4. Body parsing ───────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── 5. Request audit logging ──────────────────
app.use(requestAuditMiddleware);

// ─── 6. Public routes ──────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'QB Expense Agent',
    version: '0.1.0',
    environment: process.env.NODE_ENV || 'development',
  });
});

// Login + OAuth callback are public; other auth routes are protected internally
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth', require('./routes/auth'));

// ─── 7. Protected routes ───────────────────────
app.use('/api/receipts', authenticate, require('./routes/receipts'));
app.use('/api/admin', authenticate, require('./routes/admin'));

// ─── 8. SPA static serving ───────────────────────
app.use(express.static(clientDist));

// SPA fallback — serve index.html for any non-API route
app.get('*', (req, res) => {
  if (fs.existsSync(clientIndex)) {
    return res.sendFile(clientIndex);
  }

  // No client build — show JSON status
  res.json({
    name: 'QB Expense Agent — PerformanceLabs.AI',
    version: '0.1.0',
    hint: 'Run "npm run build:client" to enable the dashboard UI',
  });
});

// ─── 9. Error handler ──────────────────────────
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { message: err.message }),
  });
});

app.listen(PORT, () => {
  logger.info(`QB Expense Agent running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`QB Environment: ${process.env.QB_ENVIRONMENT || 'sandbox'}`);
  logger.info(`Visit http://localhost:${PORT} for status`);
});

module.exports = app;
