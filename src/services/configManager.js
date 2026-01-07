const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const CONFIG_DIR = path.join(__dirname, '../../config');
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
  return guildConfigs.get(guildId) || null;
}

/**
 * Save or update guild configuration
 * @param {string} guildId - Discord guild ID
 * @param {Object} config - Configuration object
 */
function saveGuildConfig(guildId, config) {
  const fullConfig = {
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
  const config = getGuildConfig(guildId);
  return config !== null && config.supabase_url && config.supabase_key;
}

/**
 * Clear cached config for a guild
 * @param {string} guildId - Discord guild ID
 */
function clearGuildCache(guildId) {
  guildConfigs.delete(guildId);
  saveConfigs();
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
  clearGuildCache
};
