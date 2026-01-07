const { createEventEmbed, createSprintEmbed } = require('../utils/embeds');
const { getGuildConfig } = require('./configManager');
const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

/**
 * Get Supabase client for a specific guild
 * @param {string} guildId - Guild ID
 * @returns {Object|null} Supabase client or null if config not found
 */
function getSupabaseClient(guildId) {
  const config = getGuildConfig(guildId);
  if (!config || !config.supabase_url || !config.supabase_service_role_key) {
    logger.warn(`No Supabase credentials configured for guild ${guildId}`);
    return null;
  }
  
  return createClient(config.supabase_url, config.supabase_service_role_key);
}

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

/**
 * Get Discord color for event type
 * @param {string} eventType - Event type
 * @returns {number} Discord color code
 */
function getEventColor(eventType) {
  const colors = {
    meeting: 0x5865F2,      // Blurple
    work_session: 0x57F287, // Green
    social: 0xFEE75C,       // Yellow
    training: 0xEB459E,     // Pink
    other: 0x99AAB5         // Gray
  };
  return colors[eventType] || colors.other;
}

/**
 * Add reactions to event message based on event type
 * @param {Message} message - Discord message
 * @param {string} eventType - Event type
 */
async function addEventReactions(message, eventType) {
  try {
    if (eventType === 'work_session') {
      // Work sessions: Yes/No reactions
      await message.react('✅');
      await message.react('❌');
      logger.info(`Added work session reactions to message ${message.id}`);
    } else if (eventType === 'meeting') {
      // Meetings: Yes/No/Maybe reactions
      await message.react('✅');
      await message.react('❌');
      await message.react('❓');
      logger.info(`Added meeting reactions to message ${message.id}`);
    }
    // Other event types: no reactions
  } catch (error) {
    logger.error(`Failed to add reactions to message ${message.id}:`, error);
  }
}

/**
 * Update event record with notification details
 * @param {string} guildId - Guild ID
 * @param {string} eventId - Event ID
 * @param {string} messageId - Discord message ID
 */
async function updateEventNotification(guildId, eventId, messageId) {
  try {
    const supabase = getSupabaseClient(guildId);
    if (!supabase) {
      throw new Error(`No Supabase client available for guild ${guildId}`);
    }
    
    const { error } = await supabase
      .from('team_events')
      .update({
        discord_message_id: messageId,
        notified_at: new Date().toISOString()
      })
      .eq('id', eventId);

    if (error) throw error;
    logger.info(`Updated event ${eventId} with message ID ${messageId}`);
  } catch (error) {
    logger.error(`Failed to update event ${eventId}:`, error);
    throw error;
  }
}

/**
 * Send immediate notification for a new event
 * @param {Client} client - Discord client
 * @param {string} guildId - Guild ID
 * @param {Object} event - Event object from database
 * @returns {Promise<Message|null>}
 */
async function sendImmediateNotification(client, guildId, event) {
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

    // Create embed
    const embed = createEventEmbed(event);
    embed.setTitle(`📅 New Event: ${event.title}`);
    embed.setColor(getEventColor(event.event_type));

    // Build role mentions
    let content = '';
    if (event.discord_role_ids && event.discord_role_ids.length > 0) {
      const mentions = event.discord_role_ids.map(roleId => `<@&${roleId}>`).join(' ');
      content = mentions;
    }

    // Send message
    const message = await channel.send({
      content: content || undefined,
      embeds: [embed]
    });

    logger.info(`Sent immediate notification for event ${event.id} to guild ${guildId}`);

    // Add reactions based on event type
    await addEventReactions(message, event.event_type);

    return message;
  } catch (error) {
    logger.error(`Failed to send immediate notification for event ${event.id}:`, error);
    throw error;
  }
}

/**
 * Send notification with retry logic
 * @param {Client} client - Discord client
 * @param {string} guildId - Guild ID
 * @param {Object} event - Event object
 * @param {number} maxRetries - Maximum retry attempts (default: 3)
 * @returns {Promise<Message|null>}
 */
async function sendNotificationWithRetry(client, guildId, event, maxRetries = 3) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info(`Sending notification for event ${event.id} (attempt ${attempt}/${maxRetries})`);
      
      const message = await sendImmediateNotification(client, guildId, event);
      
      if (message) {
        // Update database with message ID
        await updateEventNotification(guildId, event.id, message.id);
        return message;
      }
      
      throw new Error('Failed to send message (returned null)');
    } catch (error) {
      lastError = error;
      logger.error(`Attempt ${attempt}/${maxRetries} failed:`, error);
      
      if (attempt < maxRetries) {
        // Exponential backoff: 2s, 4s, 8s
        const delay = Math.pow(2, attempt) * 1000;
        logger.info(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  logger.error(`All ${maxRetries} attempts failed for event ${event.id}`);
  throw lastError;
}

module.exports = {
  sendNotification,
  sendEventNotification,
  sendSprintNotification,
  sendHolidayNotification,
  sendImmediateNotification,
  sendNotificationWithRetry,
  addEventReactions,
  updateEventNotification,
  getEventColor
};
