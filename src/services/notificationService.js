const { createEventEmbed } = require('../utils/embeds');
const { getGuildConfig, getGuildsByOrganization } = require('./configManager');
const logger = require('../utils/logger');

/**
 * Send a notification to a guild's notification channel
 * @param {Client} client - Discord client
 * @param {string} guildId - Guild ID
 * @param {Object} options - { embeds, content }
 * @returns {Promise<Message|null>}
 */
async function sendNotification(client, guildId, { embeds, content } = {}) {
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

    const message = await channel.send({
      content: content || undefined,
      embeds: embeds || []
    });
    logger.info(`Sent notification to guild ${guildId}`);
    return message;
  } catch (error) {
    logger.error(`Failed to send notification to guild ${guildId}:`, error);
    return null;
  }
}

/**
 * Send an event notification to all guilds linked to an organization
 * @param {Client} client - Discord client
 * @param {Object} event - Calendar event from database
 * @param {string} type - 'new', 'reminder', 'starting'
 * @returns {Promise<Message[]>}
 */
async function sendEventNotification(client, event, type = 'new') {
  const orgId = event.organization_id;
  if (!orgId) {
    logger.warn('Event missing organization_id, cannot route notification');
    return [];
  }

  const guildIds = getGuildsByOrganization(orgId);
  if (guildIds.length === 0) {
    logger.info(`No guilds linked to organization ${orgId}`);
    return [];
  }

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
    default:
      embed.setTitle(`📅 New Event: ${event.title}`);
      embed.setColor(0x5865F2);
      break;
  }

  const messages = [];
  for (const guildId of guildIds) {
    const msg = await sendNotification(client, guildId, { embeds: [embed] });
    if (msg) {
      // Add RSVP reactions for meetings
      if (event.type === 'meeting') {
        try {
          await msg.react('✅');
          await msg.react('❌');
          await msg.react('❓');
        } catch (e) {
          logger.error(`Failed to add reactions: ${e.message}`);
        }
      }
      messages.push(msg);
    }
  }

  return messages;
}

/**
 * Send event notification with retry logic
 * @param {Client} client - Discord client
 * @param {Object} event - Calendar event
 * @param {number} maxRetries - Max retry attempts
 * @returns {Promise<Message[]>}
 */
async function sendNotificationWithRetry(client, event, maxRetries = 3) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info(`Sending notification for event "${event.title}" (attempt ${attempt}/${maxRetries})`);
      const messages = await sendEventNotification(client, event, 'new');
      if (messages.length > 0) return messages;
      throw new Error('No messages sent');
    } catch (error) {
      lastError = error;
      logger.error(`Attempt ${attempt}/${maxRetries} failed:`, error);
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  logger.error(`All ${maxRetries} attempts failed for event "${event.title}"`);
  throw lastError;
}

module.exports = {
  sendNotification,
  sendEventNotification,
  sendNotificationWithRetry
};
