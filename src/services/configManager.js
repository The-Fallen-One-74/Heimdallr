const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const { STATE_DIR } = require('../utils/jsonStore');

const CONFIG_DIR = STATE_DIR;
const CONFIG_FILE = path.join(CONFIG_DIR, 'guilds.json');

// In-memory cache of guild configurations
let guildConfigs = new Map();

/**
 * Load configurations from file
 */
function loadConfigs() {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }

    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf8');
      const configs = JSON.parse(data);
      guildConfigs = new Map(Object.entries(configs));
      logger.info(`Loaded ${guildConfigs.size} guild configuration(s)`);

      const unlinked = [...guildConfigs.values()].filter(c => !isLinked(c)).length;
      if (unlinked) logger.warn(`${unlinked} server(s) were set up by organization ID and need /setup with a link code`);
    }
  } catch (error) {
    logger.error('Failed to load guild configs:', error);
  }
}

/**
 * Save configurations to file
 */
function saveConfigs() {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }

    const configs = Object.fromEntries(guildConfigs);
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(configs, null, 2));
    logger.info('Guild configurations saved');
  } catch (error) {
    logger.error('Failed to save guild configs:', error);
    throw error;
  }
}

/**
 * Get configuration for a specific guild
 * @param {string} guildId - Discord guild ID
 * @returns {Object|null} Guild configuration
 */
function getGuildConfig(guildId) {
  const config = guildConfigs.get(guildId);
  return isLinked(config) ? config : null;
}

/**
 * Servers count as linked only once they redeemed a Bifröst link code.
 * Older configs saved with a typed organization ID are ignored until re-linked.
 */
function isLinked(config) {
  return Boolean(config?.connection_id && config.organization_id != null);
}

/**
 * Save or update guild configuration
 * @param {string} guildId - Discord guild ID
 * @param {Object} config - Configuration object
 */
function saveGuildConfig(guildId, config) {
  const existing = guildConfigs.get(guildId) || {};
  const fullConfig = {
    ...existing,
    guild_id: guildId,
    ...config,
    updated_at: new Date().toISOString()
  };

  guildConfigs.set(guildId, fullConfig);
  saveConfigs();
  logger.info(`Saved config for guild ${guildId}`);
  return fullConfig;
}

/**
 * Check if a guild is configured
 * @param {string} guildId - Discord guild ID
 * @returns {boolean}
 */
function isGuildConfigured(guildId) {
  return getGuildConfig(guildId) !== null;
}

/**
 * Find guild ID(s) linked to a specific organization
 * @param {number} orgId - Bifrost organization ID
 * @returns {string[]} Array of guild IDs
 */
function getGuildsByOrganization(orgId) {
  const guilds = [];
  for (const [guildId, config] of guildConfigs) {
    if (isLinked(config) && config.organization_id === orgId) {
      guilds.push(guildId);
    }
  }
  return guilds;
}

/**
 * Get all guild configurations
 * @returns {Object} Object with guildId as keys and config as values
 */
function getAllGuildConfigs() {
  return Object.fromEntries(guildConfigs);
}

// Load configs on startup
loadConfigs();

module.exports = {
  getGuildConfig,
  getAllGuildConfigs,
  saveGuildConfig,
  isGuildConfigured,
  getGuildsByOrganization
};
