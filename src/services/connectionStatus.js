const { getBifrostClient } = require('./bifrostClient');
const { getGuildConfig, unlinkGuild } = require('./configManager');
const logger = require('../utils/logger');

// How long a "still linked" answer is trusted before asking Bifröst again
const CACHE_MS = 5 * 60 * 1000;

// connection_id → time it was last confirmed live
const confirmedAt = new Map();

/**
 * Whether a Supabase error means discord_connections isn't in the database
 * yet (Bifröst step 1 not applied). PGRST205 comes from PostgREST, 42P01
 * from Postgres itself.
 */
function isMissingTable(error) {
  return error?.code === 'PGRST205' || error?.code === '42P01';
}

/**
 * Check that a server's Bifröst connection hasn't been disconnected in
 * Bifröst Org Settings, and unlink the server locally if it has. Call before
 * reading org data for, or posting to, a server.
 * @param {string} guildId - Discord guild ID
 * @returns {Promise<boolean>} true when the server is linked and live
 */
async function ensureLiveConnection(guildId) {
  const config = getGuildConfig(guildId);
  if (!config) return false;

  const last = confirmedAt.get(config.connection_id);
  if (last && Date.now() - last < CACHE_MS) return true;

  const client = getBifrostClient();
  if (!client) return true;

  const { data, error } = await client
    .from('discord_connections')
    .select('revoked_at')
    .eq('id', config.connection_id)
    .maybeSingle();

  if (error) {
    // Keep working when the table isn't there yet or Bifröst is briefly
    // unreachable; a real disconnect is caught on the next check
    if (!isMissingTable(error)) logger.warn(`Could not check Bifröst connection for guild ${guildId}: ${error.message}`);
    return true;
  }

  if (!data || data.revoked_at) {
    confirmedAt.delete(config.connection_id);
    unlinkGuild(guildId);
    return false;
  }

  confirmedAt.set(config.connection_id, Date.now());
  return true;
}

/**
 * Forget cached answers (tests)
 */
function clearConnectionCache() {
  confirmedAt.clear();
}

module.exports = {
  ensureLiveConnection,
  clearConnectionCache
};
