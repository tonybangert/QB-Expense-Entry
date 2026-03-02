// src/services/quickbooks.js
// QuickBooks Online API client — handles OAuth, token management, and expense CRUD

const { QB_CONFIG, endpoints, queries } = require('../../config/quickbooks');
const TokenStore = require('../utils/token-store');
const logger = require('../utils/logger');

class QuickBooksService {
  constructor() {
    this.tokenStore = new TokenStore();
    this.companyId = process.env.QB_COMPANY_ID;
  }

  // ─────────────────────────────────────────────
  // OAuth 2.0 Flow
  // ─────────────────────────────────────────────

  /**
   * Generate the authorization URL to redirect the user to Intuit
   * This is Step 1 of the OAuth flow
   */
  getAuthorizationUrl(state = 'default') {
    const params = new URLSearchParams({
      client_id: QB_CONFIG.clientId,
      scope: QB_CONFIG.scopes.join(' '),
      redirect_uri: QB_CONFIG.redirectUri,
      response_type: 'code',
      state: state,
    });
    return `${QB_CONFIG.oauth.authorizationEndpoint}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access + refresh tokens
   * This is Step 2 — called from the OAuth callback route
   */
  async exchangeCodeForTokens(authorizationCode, realmId) {
    const credentials = Buffer.from(
      `${QB_CONFIG.clientId}:${QB_CONFIG.clientSecret}`
    ).toString('base64');

    const response = await fetch(QB_CONFIG.oauth.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'Authorization': `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: authorizationCode,
        redirect_uri: QB_CONFIG.redirectUri,
      }).toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token exchange failed: ${response.status} — ${error}`);
    }

    const tokenData = await response.json();

    // Store tokens securely with metadata
    await this.tokenStore.save({
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      accessTokenExpiresAt: Date.now() + (tokenData.expires_in * 1000),
      refreshTokenExpiresAt: Date.now() + (QB_CONFIG.refreshTokenLifetime * 1000),
      realmId: realmId,
      tokenType: tokenData.token_type,
    });

    this.companyId = realmId;
    logger.info(`QuickBooks connected successfully. Company ID: ${realmId}`);

    return tokenData;
  }

  /**
   * Refresh the access token using the refresh token
   * Called automatically when access token expires
   */
  async refreshAccessToken() {
    const tokens = await this.tokenStore.load();
    if (!tokens || !tokens.refreshToken) {
      throw new Error('No refresh token available. Re-authorize at /api/auth/connect');
    }

    const credentials = Buffer.from(
      `${QB_CONFIG.clientId}:${QB_CONFIG.clientSecret}`
    ).toString('base64');

    const response = await fetch(QB_CONFIG.oauth.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'Authorization': `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokens.refreshToken,
      }).toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error(`Token refresh failed: ${error}`);
      throw new Error('Token refresh failed. Re-authorize at /api/auth/connect');
    }

    const tokenData = await response.json();

    // Update stored tokens (QB issues a new refresh token each time)
    await this.tokenStore.save({
      ...tokens,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      accessTokenExpiresAt: Date.now() + (tokenData.expires_in * 1000),
      refreshTokenExpiresAt: Date.now() + (QB_CONFIG.refreshTokenLifetime * 1000),
    });

    logger.info('QuickBooks access token refreshed successfully');
    return tokenData.access_token;
  }

  /**
   * Get a valid access token, refreshing if needed
   */
  async getValidToken() {
    const tokens = await this.tokenStore.load();
    if (!tokens) throw new Error('Not connected to QuickBooks');

    // Refresh if token expires within 5 minutes
    if (Date.now() > tokens.accessTokenExpiresAt - 300000) {
      return await this.refreshAccessToken();
    }

    return tokens.accessToken;
  }

  // ─────────────────────────────────────────────
  // API Request Helper
  // ─────────────────────────────────────────────

  /**
   * Make an authenticated request to the QuickBooks API
   */
  async apiRequest(method, endpoint, body = null) {
    const token = await this.getValidToken();
    const url = `${QB_CONFIG.apiBaseUrl}${endpoint}?minorversion=${QB_CONFIG.minorVersion}`;

    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok) {
      logger.error('QB API Error:', { status: response.status, body: data });
      throw new Error(`QB API Error ${response.status}: ${JSON.stringify(data)}`);
    }

    return data;
  }

  /**
   * Execute a QuickBooks query (SQL-like syntax)
   */
  async query(queryString) {
    const companyId = await this.getCompanyId();
    const endpoint = endpoints.query(companyId);
    const token = await this.getValidToken();

    const url = `${QB_CONFIG.apiBaseUrl}${endpoint}?query=${encodeURIComponent(queryString)}&minorversion=${QB_CONFIG.minorVersion}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    });

    const data = await response.json();
    if (!response.ok) throw new Error(`Query failed: ${JSON.stringify(data)}`);

    return data.QueryResponse;
  }

  async getCompanyId() {
    if (this.companyId) return this.companyId;
    const tokens = await this.tokenStore.load();
    if (tokens?.realmId) {
      this.companyId = tokens.realmId;
      return this.companyId;
    }
    throw new Error('Company ID not available. Connect QuickBooks first.');
  }

  // ─────────────────────────────────────────────
  // Expense (Purchase) Operations
  // ─────────────────────────────────────────────

  /**
   * Create an expense in QuickBooks from extracted receipt data
   *
   * @param {Object} expenseData - Structured receipt data
   * @param {string} expenseData.vendorName - Vendor/store name
   * @param {string} expenseData.date - Transaction date (YYYY-MM-DD)
   * @param {number} expenseData.totalAmount - Total amount
   * @param {string} expenseData.paymentMethod - cash, credit_card, check
   * @param {Array}  expenseData.lineItems - Individual items/categories
   * @param {string} expenseData.description - Receipt description
   */
  async createExpense(expenseData) {
    const companyId = await this.getCompanyId();

    // Resolve vendor (find existing or create new)
    const vendorRef = await this.resolveVendor(expenseData.vendorName);

    // Resolve payment account
    const accountRef = await this.resolvePaymentAccount(expenseData.paymentMethod);

    // Map payment type
    const paymentTypeMap = {
      'cash': 'Cash',
      'credit_card': 'CreditCard',
      'check': 'Check',
      'debit': 'Cash',
    };

    // Build line items (pass suggestedCategory for account mapping)
    const lines = await this.buildLineItems(expenseData.lineItems, expenseData.totalAmount, expenseData.suggestedCategory);

    const purchase = {
      PaymentType: paymentTypeMap[expenseData.paymentMethod] || 'Cash',
      AccountRef: accountRef,
      EntityRef: vendorRef,
      TxnDate: expenseData.date,
      TotalAmt: expenseData.totalAmount,
      Line: lines,
      PrivateNote: `Auto-entered by PL Expense Agent | ${expenseData.description || ''}`.trim(),
    };

    const result = await this.apiRequest(
      'POST',
      endpoints.createPurchase(companyId),
      purchase
    );

    logger.info(`Expense created in QB: Purchase ID ${result.Purchase.Id}`);
    return result.Purchase;
  }

  /**
   * Find an existing vendor or create a new one
   */
  async resolveVendor(vendorName) {
    if (!vendorName || typeof vendorName !== 'string') {
      throw new Error('Vendor name is required');
    }
    vendorName = vendorName.trim();
    if (vendorName.length === 0) {
      throw new Error('Vendor name cannot be empty');
    }
    if (vendorName.length > 200) {
      vendorName = vendorName.substring(0, 200);
    }

    try {
      const result = await this.query(queries.vendorByName(vendorName));
      if (result.Vendor && result.Vendor.length > 0) {
        const vendor = result.Vendor[0];
        return { value: vendor.Id, name: vendor.DisplayName };
      }
    } catch (e) {
      logger.warn(`Vendor lookup failed for "${vendorName}": ${e.message}`);
    }

    // Create new vendor
    const companyId = await this.getCompanyId();
    const newVendor = await this.apiRequest(
      'POST',
      endpoints.createVendor(companyId),
      { DisplayName: vendorName }
    );

    logger.info(`Created new vendor: ${vendorName} (ID: ${newVendor.Vendor.Id})`);
    return { value: newVendor.Vendor.Id, name: newVendor.Vendor.DisplayName };
  }

  /**
   * Resolve the payment account based on payment method
   */
  async resolvePaymentAccount(paymentMethod) {
    // TODO: Make this configurable — map payment methods to specific QB accounts
    // For now, return a placeholder that should be configured in .env
    const accountMappings = {
      'cash': { value: process.env.QB_CASH_ACCOUNT_ID || '35', name: 'Checking' },
      'credit_card': { value: process.env.QB_CC_ACCOUNT_ID || '42', name: 'Visa' },
      'check': { value: process.env.QB_CHECK_ACCOUNT_ID || '35', name: 'Checking' },
      'debit': { value: process.env.QB_DEBIT_ACCOUNT_ID || '35', name: 'Checking' },
    };

    return accountMappings[paymentMethod] || accountMappings['cash'];
  }

  /**
   * Map an AI-extracted category string to a QB expense account ID.
   * Keys are normalized lowercase; matching checks for substring inclusion.
   */
  resolveExpenseAccount(category) {
    const CATEGORY_MAP = {
      'software':        { value: '10', name: 'Dues & Subscriptions' },
      'subscription':    { value: '10', name: 'Dues & Subscriptions' },
      'dues':            { value: '10', name: 'Dues & Subscriptions' },
      'saas':            { value: '10', name: 'Dues & Subscriptions' },
      'office':          { value: '15', name: 'Office Expenses' },
      'supplies':        { value: '20', name: 'Supplies' },
      'stationery':      { value: '19', name: 'Stationery & Printing' },
      'meal':            { value: '13', name: 'Meals and Entertainment' },
      'entertainment':   { value: '13', name: 'Meals and Entertainment' },
      'dining':          { value: '13', name: 'Meals and Entertainment' },
      'restaurant':      { value: '13', name: 'Meals and Entertainment' },
      'food':            { value: '13', name: 'Meals and Entertainment' },
      'travel':          { value: '22', name: 'Travel' },
      'flight':          { value: '22', name: 'Travel' },
      'hotel':           { value: '22', name: 'Travel' },
      'lodging':         { value: '22', name: 'Travel' },
      'travel meal':     { value: '23', name: 'Travel Meals' },
      'utility':         { value: '24', name: 'Utilities' },
      'electric':        { value: '76', name: 'Gas and Electric' },
      'gas and electric': { value: '76', name: 'Gas and Electric' },
      'telephone':       { value: '77', name: 'Telephone' },
      'phone':           { value: '77', name: 'Telephone' },
      'internet':        { value: '77', name: 'Telephone' },
      'professional':    { value: '12', name: 'Legal & Professional Fees' },
      'legal':           { value: '71', name: 'Lawyer' },
      'accounting':      { value: '69', name: 'Accounting' },
      'auto':            { value: '55', name: 'Automobile' },
      'transport':       { value: '55', name: 'Automobile' },
      'vehicle':         { value: '55', name: 'Automobile' },
      'fuel':            { value: '56', name: 'Fuel' },
      'gasoline':        { value: '56', name: 'Fuel' },
      'parking':         { value: '55', name: 'Automobile' },
      'advertising':     { value: '7',  name: 'Advertising' },
      'marketing':       { value: '7',  name: 'Advertising' },
      'promotional':     { value: '16', name: 'Promotional' },
      'insurance':       { value: '11', name: 'Insurance' },
      'repair':          { value: '72', name: 'Maintenance and Repair' },
      'maintenance':     { value: '72', name: 'Maintenance and Repair' },
      'rent':            { value: '17', name: 'Rent or Lease' },
      'lease':           { value: '17', name: 'Rent or Lease' },
      'tax':             { value: '21', name: 'Taxes & Licenses' },
      'license':         { value: '21', name: 'Taxes & Licenses' },
      'equipment rental': { value: '29', name: 'Equipment Rental' },
      'bank charge':     { value: '8',  name: 'Bank Charges' },
      'commission':      { value: '9',  name: 'Commissions & fees' },
    };

    if (!category) return { value: '31', name: 'Uncategorized Expense' };

    const lower = category.toLowerCase();

    // Try longest match first (e.g. "travel meal" before "travel")
    const sortedKeys = Object.keys(CATEGORY_MAP).sort((a, b) => b.length - a.length);
    for (const key of sortedKeys) {
      if (lower.includes(key)) {
        return CATEGORY_MAP[key];
      }
    }

    return { value: '31', name: 'Uncategorized Expense' };
  }

  /**
   * Build QB line items from extracted receipt data
   */
  async buildLineItems(lineItems, totalAmount, suggestedCategory) {
    if (!lineItems || lineItems.length === 0) {
      const accountRef = this.resolveExpenseAccount(suggestedCategory);
      return [{
        Amount: totalAmount,
        DetailType: 'AccountBasedExpenseLineDetail',
        AccountBasedExpenseLineDetail: { AccountRef: accountRef },
        Description: 'Receipt expense',
      }];
    }

    return lineItems.map(item => ({
      Amount: item.amount,
      DetailType: 'AccountBasedExpenseLineDetail',
      AccountBasedExpenseLineDetail: {
        AccountRef: this.resolveExpenseAccount(item.category),
      },
      Description: item.description || '',
    }));
  }

  // ─────────────────────────────────────────────
  // Utility Methods
  // ─────────────────────────────────────────────

  /**
   * Get all expense accounts from the chart of accounts
   * Used to populate category dropdowns and map AI categories
   */
  async getExpenseAccounts() {
    return await this.query(queries.allExpenseAccounts);
  }

  /**
   * Get all vendors
   */
  async getVendors() {
    return await this.query(queries.allVendors);
  }

  /**
   * Test the connection by fetching company info
   */
  async testConnection() {
    const companyId = await this.getCompanyId();
    const result = await this.apiRequest(
      'GET',
      endpoints.companyInfo(companyId)
    );
    return result.CompanyInfo;
  }

  /**
   * Check if we have a valid, active connection
   */
  async isConnected() {
    try {
      const tokens = await this.tokenStore.load();
      if (!tokens) return false;

      // Check if refresh token is still valid
      if (Date.now() > tokens.refreshTokenExpiresAt) return false;

      return true;
    } catch {
      return false;
    }
  }
}

module.exports = new QuickBooksService();
