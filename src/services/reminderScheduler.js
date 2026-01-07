const cron = require('node-cron');
const { getGuildConfig } = require('./configManager');
const { getUpcomingEvents, getHolidays, getSprints } = require('./eventManager');
const { createEventEmbed, createSprintEmbed } = require('../utils/embeds');
const { hasBeenSent, markAsSent } = require('./reminderTracker');
const logger = require('../utils/logger');

let client = null;
let scheduledJobs = [];

/**
 * Initialize the reminder scheduler
 * @param {Client} discordClient - Discord client instance
 */
function initScheduler(discordClient) {
  client = discordClient;
  
  // Check for upcoming events every 5 minutes
  const job = cron.schedule('*/5 * * * *', async () => {
    await checkUpcomingEvents();
  });

  scheduledJobs.push(job);
  logger.info('Reminder scheduler initialized - checking every 5 minutes');
}

/**
 * Check for upcoming events and send reminders
 */
async function checkUpcomingEvents() {
  if (!client) return;

  try {
    // Get all guilds the bot is in
    const guilds = client.guilds.cache;

    for (const [guildId, guild] of guilds) {
      try {
        const config = getGuildConfig(guildId);
        if (!config || !config.notification_channel_id) {
          continue;
        }

        // Get events for the next 7 days
        const events = await getUpcomingEvents(guildId, 7);
        
        // Get holidays for the next 30 days
        const holidays = await getHolidays(guildId, 30);
        
        // Get current and upcoming sprints
        const sprints = await getSprints(guildId, 5);
        
        // Combine events and holidays
        const allEvents = [...events, ...holidays];
        const now = new Date();

        // Check sprint start/end notifications
        for (const sprint of sprints) {
          await checkSprintNotifications(guild, config, sprint, now);
        }

        for (const event of allEvents) {
          const eventDate = event.datetime || new Date(event.start_date);
          const minutesUntil = Math.floor((eventDate - now) / (1000 * 60));

          // Get reminder times from config (in minutes)
          const eventType = event.event_type || 'holiday';
          const reminderTimes = getReminderTimes(config, eventType);

          // Check if we should send a reminder
          for (const reminderTime of reminderTimes) {
            // Send reminder if we're within 5 minutes of the reminder time
            if (Math.abs(minutesUntil - reminderTime) <= 5) {
              // Check if we've already sent this reminder
              const eventId = event.id || `${event.title}-${event.start_date}`;
              if (!hasBeenSent(guildId, eventId, reminderTime)) {
                await sendReminder(guild, config, event, reminderTime);
                markAsSent(guildId, eventId, reminderTime, event.title || event.name);
              }
            }
          }
        }
      } catch (error) {
        logger.error(`Error checking events for guild ${guildId}:`, error);
      }
    }
  } catch (error) {
    logger.error('Error in checkUpcomingEvents:', error);
  }
}

/**
 * Get reminder times for an event type
 * @param {Object} config - Guild configuration
 * @param {string} eventType - Event type
 * @returns {Array} Array of reminder times in minutes
 */
function getReminderTimes(config, eventType) {
  const defaults = {
    meeting: [1440, 60, 15], // 24h, 1h, 15m
    sprint: [1440, 60],       // 24h, 1h
    holiday: [10080, 1440]    // 1 week, 1 day
  };

  if (config.reminder_times && config.reminder_times[eventType]) {
    return config.reminder_times[eventType];
  }

  return defaults[eventType] || [1440, 60]; // Default to 24h and 1h
}

/**
 * Send a reminder for an event
 * @param {Guild} guild - Discord guild
 * @param {Object} config - Guild configuration
 * @param {Object} event - Event object
 * @param {number} minutesUntil - Minutes until event
 */
async function sendReminder(guild, config, event, minutesUntil) {
  try {
    const channel = await guild.channels.fetch(config.notification_channel_id);
    if (!channel) {
      logger.warn(`Notification channel not found for guild ${guild.id}`);
      return;
    }

    const embed = createEventEmbed(event);
    
    // Add reminder-specific information
    const timeText = formatReminderTime(minutesUntil);
    embed.setTitle(`⏰ Reminder: ${event.title}`);
    embed.setDescription(`This event is starting ${timeText}!`);
    embed.setColor(0xFF9900); // Orange for reminders

    // Prepare message content with role mentions if applicable
    let messageContent = '';
    const eventType = event.event_type || 'holiday';
    
    if (event.discord_role_ids && Array.isArray(event.discord_role_ids) && event.discord_role_ids.length > 0) {
      // Event with specific roles - mention all roles
      const mentions = event.discord_role_ids.map(roleId => `<@&${roleId}>`).join(' ');
      messageContent = mentions;
    } else if (eventType === 'holiday') {
      // Holidays tag @everyone
      messageContent = '@everyone';
    }

    const message = await channel.send({ 
      content: messageContent || undefined,
      embeds: [embed] 
    });
    
    // Add RSVP reactions for meetings and work sessions
    if (event.event_type === 'meeting') {
      await message.react('✅');
      await message.react('❌');
      await message.react('❓');
    } else if (event.event_type === 'work_session') {
      await message.react('✅');
      await message.react('❌');
    }
    
    const roleInfo = event.discord_role_ids?.length > 0 
      ? ` with ${event.discord_role_ids.length} role mention(s)` 
      : '';
    logger.info(`Sent reminder for event "${event.title}" in guild ${guild.id} (${timeText})${roleInfo}`);
  } catch (error) {
    logger.error(`Failed to send reminder for guild ${guild.id}:`, error);
  }
}

/**
 * Format reminder time for display
 * @param {number} minutes - Minutes until event
 * @returns {string}
 */
function formatReminderTime(minutes) {
  if (minutes <= 0) {
    return 'now';
  } else if (minutes < 60) {
    return `in ${minutes} minute${minutes !== 1 ? 's' : ''}`;
  } else if (minutes < 1440) {
    const hours = Math.floor(minutes / 60);
    return `in ${hours} hour${hours !== 1 ? 's' : ''}`;
  } else {
    const days = Math.floor(minutes / 1440);
    return `in ${days} day${days !== 1 ? 's' : ''}`;
  }
}

/**
 * Check and send sprint notifications
 * @param {Guild} guild - Discord guild
 * @param {Object} config - Guild configuration
 * @param {Object} sprint - Sprint object
 * @param {Date} now - Current time
 */
async function checkSprintNotifications(guild, config, sprint, now) {
  const startDate = new Date(sprint.start_date);
  const endDate = new Date(sprint.end_date);
  
  const minutesUntilStart = Math.floor((startDate - now) / (1000 * 60));
  const minutesUntilEnd = Math.floor((endDate - now) / (1000 * 60));
  
  const sprintId = sprint.id || sprint.name;
  
  // Sprint starting notifications (24h and 1h before)
  const startReminders = [1440, 60]; // 24h, 1h
  for (const reminderTime of startReminders) {
    if (Math.abs(minutesUntilStart - reminderTime) <= 5) {
      if (!hasBeenSent(guild.id, `${sprintId}-start`, reminderTime)) {
        await sendSprintReminder(guild, config, sprint, 'starting', reminderTime);
        markAsSent(guild.id, `${sprintId}-start`, reminderTime, `${sprint.name} starting`);
      }
    }
  }
  
  // Sprint ending notifications (24h and 1h before)
  const endReminders = [1440, 60]; // 24h, 1h
  for (const reminderTime of endReminders) {
    if (Math.abs(minutesUntilEnd - reminderTime) <= 5) {
      if (!hasBeenSent(guild.id, `${sprintId}-end`, reminderTime)) {
        await sendSprintReminder(guild, config, sprint, 'ending', reminderTime);
        markAsSent(guild.id, `${sprintId}-end`, reminderTime, `${sprint.name} ending`);
      }
    }
  }
}

/**
 * Send a sprint reminder
 * @param {Guild} guild - Discord guild
 * @param {Object} config - Guild configuration
 * @param {Object} sprint - Sprint object
 * @param {string} type - 'starting' or 'ending'
 * @param {number} minutesUntil - Minutes until event
 */
async function sendSprintReminder(guild, config, sprint, type, minutesUntil) {
  try {
    const channel = await guild.channels.fetch(config.notification_channel_id);
    if (!channel) {
      logger.warn(`Notification channel not found for guild ${guild.id}`);
      return;
    }

    const embed = createSprintEmbed(sprint);
    const timeText = formatReminderTime(minutesUntil);
    
    if (type === 'starting') {
      embed.setTitle(`🚀 Sprint Starting: ${sprint.name}`);
      embed.setDescription(`Sprint "${sprint.name}" is starting ${timeText}!`);
      embed.setColor(0x00FF00);
    } else {
      embed.setTitle(`🏁 Sprint Ending: ${sprint.name}`);
      embed.setDescription(`Sprint "${sprint.name}" is ending ${timeText}!`);
      embed.setColor(0xFF9900);
    }

    await channel.send({ 
      content: '@everyone',
      embeds: [embed] 
    });
    logger.info(`Sent sprint ${type} reminder for "${sprint.name}" in guild ${guild.id} (${timeText}) with @everyone mention`);
  } catch (error) {
    logger.error(`Failed to send sprint reminder for guild ${guild.id}:`, error);
  }
}

/**
 * Stop all scheduled jobs
 */
function stopScheduler() {
  scheduledJobs.forEach(job => job.stop());
  scheduledJobs = [];
  logger.info('Reminder scheduler stopped');
}

module.exports = {
  initScheduler,
  stopScheduler,
  checkUpcomingEvents
};
