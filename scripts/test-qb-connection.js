#!/usr/bin/env node
// scripts/test-qb-connection.js
// Quick verification that QuickBooks connection is working

require('dotenv').config();
const qbService = require('../src/services/quickbooks');

async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   QB Expense Agent — Connection Test     ║');
  console.log('╚══════════════════════════════════════════╝\n');

  // Check configuration
  console.log('1. Checking configuration...');
  const checks = {
    'QB_CLIENT_ID': !!process.env.QB_CLIENT_ID,
    'QB_CLIENT_SECRET': !!process.env.QB_CLIENT_SECRET,
    'QB_REDIRECT_URI': !!process.env.QB_REDIRECT_URI,
    'ANTHROPIC_API_KEY': !!process.env.ANTHROPIC_API_KEY,
    'ENCRYPTION_KEY': !!process.env.ENCRYPTION_KEY,
  };

  for (const [key, present] of Object.entries(checks)) {
    console.log(`   ${present ? '✓' : '✗'} ${key}: ${present ? 'Set' : 'MISSING'}`);
  }

  const missing = Object.entries(checks).filter(([, v]) => !v);
  if (missing.length > 0) {
    console.log('\n⚠️  Missing environment variables. Copy .env.example to .env and fill in values.\n');
  }

  // Check QB connection
  console.log('\n2. Checking QuickBooks connection...');
  const connected = await qbService.isConnected();

  if (!connected) {
    console.log('   ✗ Not connected to QuickBooks.');
    console.log('   → Start the server (npm run dev) and visit http://localhost:3000/api/auth/connect');
    console.log('   → This will redirect you to Intuit to authorize the app.');
    return;
  }

  console.log('   ✓ Tokens found. Testing API connection...');

  try {
    const companyInfo = await qbService.testConnection();
    console.log(`   ✓ Connected to: ${companyInfo.CompanyName}`);
    console.log(`     Company ID: ${companyInfo.Id}`);
    console.log(`     Country: ${companyInfo.Country}`);

    // Fetch expense accounts
    console.log('\n3. Fetching expense accounts...');
    const accounts = await qbService.getExpenseAccounts();
    if (accounts.Account) {
      console.log(`   ✓ Found ${accounts.Account.length} expense accounts:`);
      accounts.Account.slice(0, 10).forEach(acct => {
        console.log(`     - [${acct.Id}] ${acct.Name} (${acct.AccountSubType})`);
      });
      if (accounts.Account.length > 10) {
        console.log(`     ... and ${accounts.Account.length - 10} more`);
      }
    }

    // Fetch vendors
    console.log('\n4. Fetching vendors...');
    const vendors = await qbService.getVendors();
    if (vendors.Vendor) {
      console.log(`   ✓ Found ${vendors.Vendor.length} vendors:`);
      vendors.Vendor.slice(0, 10).forEach(v => {
        console.log(`     - [${v.Id}] ${v.DisplayName}`);
      });
      if (vendors.Vendor.length > 10) {
        console.log(`     ... and ${vendors.Vendor.length - 10} more`);
      }
    }

    console.log('\n════════════════════════════════════════════');
    console.log('✅ All checks passed! Your agent is ready.');
    console.log('════════════════════════════════════════════\n');

  } catch (error) {
    console.log(`   ✗ API call failed: ${error.message}`);
    console.log('   → Your tokens may have expired. Visit /api/auth/connect to re-authorize.');
  }
}

main().catch(console.error);
