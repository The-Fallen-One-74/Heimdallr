const { createEventEmbed, createSprintEmbed } = require('../utils/embeds');
const { getGuildConfig } = require('./configManager');
const logger = require('../utils/logger');

/**
 * Send a notification to a guild's notification channel
 * @param {Client} client - Discord client
 * @param {string} guildId - Guild ID
 * @param {Object} embed - Embed to send
 * @returns {Promise<Message|null>}
 */
async function sendNotification(client, guildId, embed) {
  try {
    const config = getGuildConfig(guildId);
    if (!config || !config.notification_channel_id) {
      logger.warn(`No notification channel configured for guild ${guildId}`);
      return null;
    }

    const guild = await client.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(config.notification_channel_id);

    if (!channel) {
      logger.warn(`Notification channel ${config.notification_channel_id} not found in guild ${guildId}`);
      return null;
    }

    const message = await channel.send({ embeds: [embed] });
    logger.info(`Sent notification to guild ${guildId}`);
    return message;
  } catch (error) {
    logger.error(`Failed to send notification to guild ${guildId}:`, error);
    return null;
  }
}

/**
 * Send an event notification
 * @param {Client} client - Discord client
 * @param {string} guildId - Guild ID
 * @param {Object} event - Event object
 * @param {string} type - Notification type (reminder, starting, etc.)
 */
async function sendEventNotification(client, guildId, event, type = 'reminder') {
  const embed = createEventEmbed(event);

  switch (type) {
    case 'reminder':
      embed.setTitle(`⏰ Reminder: ${event.title}`);
      embed.setColor(0xFF9900);
      break;
    case 'starting':
      embed.setTitle(`🚀 Starting Now: ${event.title}`);
      embed.setColor(0x00FF00);
      break;
    case 'new':
      embed.setTitle(`📅 New Event: ${event.title}`);
      embed.setColor(0x5865F2);
      break;
  }

  return await sendNotification(client, guildId, embed);
}

/**
 * Send a sprint notification
 * @param {Client} client - Discord client
 * @param {string} guildId - Guild ID
 * @param {Object} sprint - Sprint object
 * @param {string} type - Notification type
 */
async function sendSprintNotification(client, guildId, sprint, type = 'starting') {
  const embed = createSprintEmbed(sprint);

  switch (type) {
    case 'starting':
      embed.setTitle(`🚀 Sprint Starting: ${sprint.name}`);
      embed.setDescription(`Sprint "${sprint.name}" is starting today!`);
      embed.setColor(0x00FF00);
      break;
    case 'ending':
      embed.setTitle(`🏁 Sprint Ending: ${sprint.name}`);
      embed.setDescription(`Sprint "${sprint.name}" is ending today!`);
      embed.setColor(0xFF9900);
      break;
    case 'reminder':
      embed.setTitle(`⏰ Sprint Reminder: ${sprint.name}`);
      embed.setColor(0xFF9900);
      break;
  }

  return await sendNotification(client, guildId, embed);
}

/**
 * Send a holiday notification
 * @param {Client} client - Discord client
 * @param {string} guildId - Guild ID
 * @param {Object} holiday - Holiday event object
 */
async function sendHolidayNotification(client, guildId, holiday) {
  const embed = createEventEmbed(holiday);
  embed.setTitle(`🎉 ${holiday.title}`);
  embed.setColor(0xFFA500);

  return await sendNotification(client, guildId, embed);
}

module.exports = {
  sendNotification,
  sendEventNotification,
  sendSprintNotification,
  sendHolidayNotification
};
