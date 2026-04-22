const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

// Single Supabase client for the shared Bifrost database
let supabaseClient = null;

/**
 * Initialize the Supabase client from environment variables
 */
function initBifrostClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    logger.error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env');
    return null;
  }

  supabaseClient = createClient(url, key);
  logger.info('Bifröst Supabase client initialized');
  return supabaseClient;
}

/**
 * Get the shared Supabase client
 * @returns {Object|null} Supabase client
 */
function getBifrostClient() {
  if (!supabaseClient) {
    return initBifrostClient();
  }
  return supabaseClient;
}

/**
 * Test connection to the Bifrost database
 * @returns {Promise<boolean>}
 */
async function testBifrostConnection() {
  try {
    const client = getBifrostClient();
    if (!client) return false;

    const { error } = await client.from('organizations').select('id').limit(1);
    if (error) throw error;
    return true;
  } catch (error) {
    logger.error('Bifröst connection test failed:', error);
    return false;
  }
}

/**
 * Verify an organization exists
 * @param {number} orgId - Organization ID
 * @returns {Promise<Object|null>} Organization data or null
 */
async function verifyOrganization(orgId) {
  try {
    const client = getBifrostClient();
    if (!client) return null;

    const { data, error } = await client
      .from('organizations')
      .select('id, name')
      .eq('id', orgId)
      .single();

    if (error) return null;
    return data;
  } catch (error) {
    logger.error(`Failed to verify organization ${orgId}:`, error);
    return null;
  }
}

module.exports = {
  initBifrostClient,
  getBifrostClient,
  testBifrostConnection,
  verifyOrganization
};
