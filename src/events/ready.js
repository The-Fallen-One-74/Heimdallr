const { Events } = require('discord.js');
const logger = require('../utils/logger');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    logger.info(`✓ Heimdallr is watching! Logged in as ${client.user.tag}`);
    logger.info(`Watching over ${client.guilds.cache.size} realm(s)`);
    logger.info('Guild configurations loaded from config/guilds.json');
    logger.info('Reminder scheduler will start checking for events...');
  },
};
