// src/utils/token-store.js
// Secure encrypted storage for OAuth tokens

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('./logger');

const TOKEN_FILE = path.join(__dirname, '../../data/tokens.enc');
const ALGORITHM = 'aes-256-gcm';

class TokenStore {
  constructor() {
    this.encryptionKey = process.env.ENCRYPTION_KEY;
    if (!this.encryptionKey || this.encryptionKey.length < 64) {
      throw new Error(
        'ENCRYPTION_KEY must be a 32-byte hex string (64 chars). Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
      );
    }
    // Ensure data directory exists
    fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true });
  }

  /**
   * Save tokens to encrypted file
   */
  async save(tokenData) {
    const key = this._getKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    const json = JSON.stringify(tokenData);
    let encrypted = cipher.update(json, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();

    const payload = {
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      data: encrypted,
    };

    fs.writeFileSync(TOKEN_FILE, JSON.stringify(payload), 'utf8');
    logger.debug('Tokens saved successfully');
  }

  /**
   * Load and decrypt tokens
   */
  async load() {
    if (!fs.existsSync(TOKEN_FILE)) return null;

    try {
      const payload = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
      const key = this._getKey();
      const iv = Buffer.from(payload.iv, 'hex');
      const authTag = Buffer.from(payload.authTag, 'hex');

      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(payload.data, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return JSON.parse(decrypted);
    } catch (error) {
      logger.error('Failed to load tokens:', error.message);
      return null;
    }
  }

  /**
   * Delete stored tokens
   */
  async clear() {
    if (fs.existsSync(TOKEN_FILE)) {
      fs.unlinkSync(TOKEN_FILE);
      logger.info('Tokens cleared');
    }
  }

  _getKey() {
    if (!this.encryptionKey) {
      throw new Error('ENCRYPTION_KEY is not configured. Cannot encrypt/decrypt tokens.');
    }
    return Buffer.from(this.encryptionKey.substring(0, 64), 'hex');
  }
}

module.exports = TokenStore;
