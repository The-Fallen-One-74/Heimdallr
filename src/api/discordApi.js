const express = require('express');
const logger = require('../utils/logger');
const { getAllGuildConfigs } = require('../services/configManager');

/**
 * Discord API routes for fetching guilds and roles
 * Used by desktop app to populate Discord integration dropdowns
 */
function createDiscordApiRouter(client) {
  const router = express.Router();

  /**
   * GET /api/discord/guilds
   * Get all CONFIGURED guilds (Discord servers) the bot is in
   * Only returns guilds that have been set up with /setup command
   * 
   * Response: Array of guild objects
   * [
   *   {
   *     id: "1234567890",
   *     name: "My Server",
   *     icon: "a1b2c3d4e5f6" or null
   *   }
   * ]
   */
  router.get('/guilds', async (req, res) => {
    try {
      logger.info('API request: GET /api/discord/guilds');
      
      if (!client.isReady()) {
        logger.warn('Discord client not ready');
        return res.status(503).json({ error: 'Discord bot not ready' });
      }

      // Get all configured guild IDs
      const configuredGuilds = getAllGuildConfigs();
      const configuredGuildIds = Object.keys(configuredGuilds);

      // Filter to only include guilds that are configured
      const guilds = client.guilds.cache
        .filter(guild => configuredGuildIds.includes(guild.id))
        .map(guild => ({
          id: guild.id,
          name: guild.name,
          icon: guild.icon,
          memberCount: guild.memberCount
        }));

      logger.info(`Returning ${guilds.length} configured guild(s) out of ${client.guilds.cache.size} total`);
      res.json(guilds);
    } catch (error) {
      logger.error('Failed to fetch guilds:', error);
      res.status(500).json({ error: 'Failed to fetch guilds' });
    }
  });

  /**
   * GET /api/discord/guilds/:guildId/roles
   * Get all roles for a specific guild
   * 
   * Response: Array of role objects
   * [
   *   {
   *     id: "0987654321",
   *     name: "Admin",
   *     color: 16711680,
   *     position: 5
   *   }
   * ]
   */
  router.get('/guilds/:guildId/roles', async (req, res) => {
    try {
      const { guildId } = req.params;
      logger.info(`API request: GET /api/discord/guilds/${guildId}/roles`);

      if (!client.isReady()) {
        logger.warn('Discord client not ready');
        return res.status(503).json({ error: 'Discord bot not ready' });
      }

      // Fetch the guild
      const guild = await client.guilds.fetch(guildId).catch(() => null);
      
      if (!guild) {
        logger.warn(`Guild not found: ${guildId}`);
        return res.status(404).json({ error: 'Guild not found' });
      }

      // Fetch all roles for the guild
      await guild.roles.fetch();

      // Filter and sort roles
      const roles = guild.roles.cache
        .filter(role => role.name !== '@everyone') // Exclude @everyone
        .sort((a, b) => b.position - a.position)   // Sort by position (highest first)
        .map(role => ({
          id: role.id,
          name: role.name,
          color: role.color,
          position: role.position,
          mentionable: role.mentionable
        }));

      logger.info(`Returning ${roles.length} role(s) for guild ${guild.name}`);
      res.json(roles);
    } catch (error) {
      logger.error(`Failed to fetch roles for guild ${req.params.guildId}:`, error);
      res.status(500).json({ error: 'Failed to fetch roles' });
    }
  });

  return router;
}

module.exports = createDiscordApiRouter;
