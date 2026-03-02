// src/middleware/audit-log.js
// Structured audit logging for security events and request tracking

const logger = require('../utils/logger');

/**
 * Log a structured audit event.
 * Use for security-significant actions: login, logout, key creation, etc.
 */
function auditLog(event, details = {}) {
  logger.info(`[AUDIT] ${event}`, {
    audit: true,
    event,
    timestamp: new Date().toISOString(),
    ...details,
  });
}

/**
 * Express middleware that logs every request with timing, status, and user info.
 */
function requestAuditMiddleware(req, res, next) {
  const start = Date.now();

  // Capture the original end to hook into response completion
  const originalEnd = res.end;
  res.end = function (...args) {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      duration_ms: duration,
      ip: req.ip,
    };

    if (req.user) {
      logData.user_id = req.user.userId;
      logData.username = req.user.username;
      logData.auth_method = req.user.authMethod;
    }

    logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`, {
      audit: true,
      event: 'http_request',
      ...logData,
    });

    originalEnd.apply(res, args);
  };

  next();
}

module.exports = { auditLog, requestAuditMiddleware };
