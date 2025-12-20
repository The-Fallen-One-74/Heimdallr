const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

// Cache of Supabase clients per guild
const guildClients = new Map();

/**
 * Get or create a Supabase client for a specific guild's Bifröst instance
 * @param {string} guildId - Discord guild ID
 * @param {string} supabaseUrl - Guild's Supabase URL
 * @param {string} supabaseKey - Guild's Supabase key
 * @returns {Object} Supabase client
 */
function getBifrostClient(guildId, supabaseUrl, supabaseKey) {
  // Check cache
  if (guildClients.has(guildId)) {
    return guildClients.get(guildId);
  }

  // Create new client
  try {
    const client = createClient(supabaseUrl, supabaseKey);
    guildClients.set(guildId, client);
    logger.info(`Created Bifröst client for guild ${guildId}`);
    return client;
  } catch (error) {
    logger.error(`Failed to create Bifröst client for guild ${guildId}:`, error);
    return null;
  }
}

/**
 * Test connection to a guild's Bifröst instance
 * @param {string} supabaseUrl - Supabase URL
 * @param {string} supabaseKey - Supabase key
 * @returns {boolean}
 */
async function testBifrostConnection(supabaseUrl, supabaseKey) {
  try {
    const client = createClient(supabaseUrl, supabaseKey);
    const { error } = await client.from('profiles').select('count').limit(1);
    if (error) throw error;
    return true;
  } catch (error) {
    logger.error('Bifröst connection test failed:', error);
    return false;
  }
}

/**
 * Clear cached client for a guild
 * @param {string} guildId - Discord guild ID
 */
function clearGuildClient(guildId) {
  guildClients.delete(guildId);
}

module.exports = {
  getBifrostClient,
  testBifrostConnection,
  clearGuildClient
};
