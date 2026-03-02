// config/quickbooks.js
// QuickBooks OAuth 2.0 configuration and API endpoint definitions

require('dotenv').config();

const QB_CONFIG = {
  // OAuth 2.0 endpoints (same for sandbox and production)
  oauth: {
    authorizationEndpoint: 'https://appcenter.intuit.com/connect/oauth2',
    tokenEndpoint: 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
    revokeEndpoint: 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke',
    userInfoEndpoint: 'https://accounts.platform.intuit.com/v1/openid_connect/userinfo',
  },

  // App credentials
  clientId: process.env.QB_CLIENT_ID,
  clientSecret: process.env.QB_CLIENT_SECRET,
  redirectUri: process.env.QB_REDIRECT_URI || 'http://localhost:3000/api/auth/callback',

  // Scopes
  scopes: ['com.intuit.quickbooks.accounting'],

  // API base URLs
  apiBaseUrl: process.env.QB_API_BASE_URL || 'https://sandbox-quickbooks.api.intuit.com',
  environment: process.env.QB_ENVIRONMENT || 'sandbox',

  // Token lifecycle
  accessTokenLifetime: 3600,        // 1 hour
  refreshTokenLifetime: 8640000,    // 100 days in seconds

  // API versioning — always specify minor version for latest features
  minorVersion: 73,
};

// API endpoint builders
const endpoints = {
  // Company info (good for testing connection)
  companyInfo: (companyId) =>
    `/v3/company/${companyId}/companyinfo/${companyId}`,

  // Purchase (expense) CRUD
  createPurchase: (companyId) =>
    `/v3/company/${companyId}/purchase`,

  readPurchase: (companyId, purchaseId) =>
    `/v3/company/${companyId}/purchase/${purchaseId}`,

  // Vendor operations
  createVendor: (companyId) =>
    `/v3/company/${companyId}/vendor`,

  readVendor: (companyId, vendorId) =>
    `/v3/company/${companyId}/vendor/${vendorId}`,

  // Account (chart of accounts)
  readAccount: (companyId, accountId) =>
    `/v3/company/${companyId}/account/${accountId}`,

  // Attachable (receipt images)
  createAttachable: (companyId) =>
    `/v3/company/${companyId}/attachable`,

  uploadAttachment: (companyId, attachableId) =>
    `/v3/company/${companyId}/upload`,

  // General query endpoint (SQL-like queries)
  query: (companyId) =>
    `/v3/company/${companyId}/query`,
};

// Common queries
const queries = {
  allExpenseAccounts: "SELECT * FROM Account WHERE AccountType = 'Expense' MAXRESULTS 200",
  allVendors: "SELECT * FROM Vendor MAXRESULTS 500",
  vendorByName: (name) => {
    const sanitized = String(name)
      .replace(/'/g, "\\'")
      .replace(/[;\-\-\/\*\\]/g, '')
      .substring(0, 100);
    return `SELECT * FROM Vendor WHERE DisplayName LIKE '%${sanitized}%'`;
  },
  recentPurchases: (days = 30) => {
    const since = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
    return `SELECT * FROM Purchase WHERE TxnDate >= '${since}' ORDERBY TxnDate DESC MAXRESULTS 100`;
  },
};

module.exports = { QB_CONFIG, endpoints, queries };
