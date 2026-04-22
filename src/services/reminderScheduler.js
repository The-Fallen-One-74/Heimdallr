const cron = require('node-cron');
const { getGuildConfig } = require('./configManager');
const { getUpcomingEvents } = require('./eventManager');
const { createEventEmbed } = require('../utils/embeds');
const { hasBeenSent, markAsSent } = require('./reminderTracker');
const { getMessageForEvent } = require('./eventMessageMap');
const { getRSVPStats } = require('./rsvpTracker');
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
  logger.info('Reminder scheduler initialized — checking every 5 minutes');
}

/**
 * Check for upcoming events and send reminders
 */
async function checkUpcomingEvents() {
  if (!client) return;

  try {
    const guilds = client.guilds.cache;

    for (const [guildId] of guilds) {
      try {
        const config = getGuildConfig(guildId);
        if (!config || !config.notification_channel_id || !config.organization_id) {
          continue;
        }

        // Get events for the next 2 days (covers 24h reminder window)
        const events = await getUpcomingEvents(guildId, 2);
        const now = new Date();

        for (const event of events) {
          if (!event.datetime) continue;

          const minutesUntil = Math.floor((event.datetime - now) / (1000 * 60));
          const reminderTimes = getReminderTimes(config, event.type);

          for (const reminderTime of reminderTimes) {
            // Send reminder if within 5 minutes of the target time
            if (Math.abs(minutesUntil - reminderTime) <= 5) {
              const eventId = String(event.id);
              if (!hasBeenSent(guildId, eventId, reminderTime)) {
                await sendReminder(guildId, config, event, minutesUntil);
                markAsSent(guildId, eventId, reminderTime, event.title);
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
 */
function getReminderTimes(config, eventType) {
  const defaults = {
    meeting: [1440, 60, 15],   // 24h, 1h, 15m
    work_session: [60, 15],    // 1h, 15m
    social: [1440, 60],        // 24h, 1h
    training: [1440, 60],      // 24h, 1h
    holiday: [1440],           // 24h
    other: [60]                // 1h
  };

  if (config.reminder_times && config.reminder_times[eventType]) {
    return config.reminder_times[eventType];
  }

  return defaults[eventType] || defaults.other;
}

/**
 * Send a reminder for an event
 */
async function sendReminder(guildId, config, event, minutesUntil) {
  try {
    const guild = await client.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(config.notification_channel_id);
    if (!channel) {
      logger.warn(`Notification channel not found for guild ${guildId}`);
      return;
    }

    const embed = createEventEmbed(event);
    const timeText = formatReminderTime(minutesUntil);
    const unix = require('../utils/embeds').toUnixTimestamp(event.event_date, event.event_time);
    embed.setTitle(`⏰ Reminder: ${event.title}`);
    embed.setDescription(`Starting ${require('../utils/embeds').discordTimestamp(unix, 'R')}!`);
    embed.setColor(0xFF9900);

    // Build mentions from users who reacted ✅ to the original message
    let content = '';
    const msgInfo = getMessageForEvent(event.id);
    if (msgInfo) {
      const stats = getRSVPStats(msgInfo.messageId);
      const attending = stats.users.filter(u => u.reaction === '✅');
      if (attending.length > 0) {
        content = attending.map(u => `<@${u.userId}>`).join(' ');
        logger.info(`Mentioning ${attending.length} attendee(s) for "${event.title}"`);
      }
    }

    const message = await channel.send({
      content: content || undefined,
      embeds: [embed]
    });

    // Add RSVP reactions for meetings
    if (event.type === 'meeting') {
      await message.react('✅');
      await message.react('❌');
      await message.react('❓');
    }

    logger.info(`Sent reminder for "${event.title}" in guild ${guildId} (${timeText})`);
  } catch (error) {
    logger.error(`Failed to send reminder for guild ${guildId}:`, error);
  }
}

/**
 * Format reminder time for display
 */
function formatReminderTime(minutes) {
  if (minutes <= 0) return 'now';
  if (minutes < 60) return `in ${minutes} minute${minutes !== 1 ? 's' : ''}`;
  if (minutes < 1440) {
    const hours = Math.floor(minutes / 60);
    return `in ${hours} hour${hours !== 1 ? 's' : ''}`;
  }
  const days = Math.floor(minutes / 1440);
  return `in ${days} day${days !== 1 ? 's' : ''}`;
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
