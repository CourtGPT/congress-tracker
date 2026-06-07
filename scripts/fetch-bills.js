#!/usr/bin/env node

/**
 * Fetch bills from Congress.gov API
 * Usage: CONGRESS_API_KEY=xxx node scripts/fetch-bills.js --congress=119
 */

const fs = require('fs');
const path = require('path');

const API_KEY = process.env.CONGRESS_API_KEY;
const BASE_URL = 'https://api.congress.gov/v3';

async function fetchBills(congress = 119) {
  console.log(`📥 Fetching bills for Congress ${congress}...`);
  
  if (!API_KEY) {
    console.error('❌ CONGRESS_API_KEY environment variable not set');
    process.exit(1);
  }

  // TODO: Implement bill fetching logic
  console.log('✅ Placeholder: Bill fetching will be implemented');
  console.log('🔑 API Key:', API_KEY.substring(0, 8) + '...');
}

// Parse command line arguments
const args = process.argv.slice(2);
const congressArg = args.find(arg => arg.startsWith('--congress='));
const congress = congressArg ? parseInt(congressArg.split('=')[1]) : 119;

fetchBills(congress).catch(console.error);
