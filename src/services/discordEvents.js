const fs = require('fs');
const path = require('path');
const {
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  PermissionFlagsBits
} = require('discord.js');
const { getGuildConfig } = require('./configManager');
const { combineDateTime } = require('./eventManager');
const logger = require('../utils/logger');

const MAP_DIR = path.join(__dirname, '../../config');
const MAP_FILE = path.join(MAP_DIR, 'scheduled-events.json');

// Bifröst events have no end time, so Discord events default to this length
const DEFAULT_DURATION_MS = 60 * 60 * 1000;

// Maps "guildId:eventId" → { scheduledEventId, createdAt }
let scheduledEvents = new Map();

function load() {
  try {
    if (!fs.existsSync(MAP_DIR)) fs.mkdirSync(MAP_DIR, { recursive: true });
    if (fs.existsSync(MAP_FILE)) {
      scheduledEvents = new Map(Object.entries(JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'))));

      // Clean entries older than 60 days
      const cutoff = Date.now() - 60 * 24 * 60 * 60 * 1000;
      for (const [key, val] of scheduledEvents) {
        if (val.createdAt && new Date(val.createdAt).getTime() < cutoff) {
          scheduledEvents.delete(key);
        }
      }
    }
  } catch (e) {
    logger.error('Failed to load scheduled-event map:', e);
  }
}

function save() {
  try {
    if (!fs.existsSync(MAP_DIR)) fs.mkdirSync(MAP_DIR, { recursive: true });
    fs.writeFileSync(MAP_FILE, JSON.stringify(Object.fromEntries(scheduledEvents), null, 2));
  } catch (e) {
    logger.error('Failed to save scheduled-event map:', e);
  }
}

const key = (guildId, eventId) => `${guildId}:${eventId}`;

/**
 * Whether Discord events are turned on for a guild and the bot may create them
 */
function canUseDiscordEvents(guild) {
  const config = getGuildConfig(guild.id);
  if (!config || config.discord_events === false) return false;

  if (!guild.members.me?.permissions.has(PermissionFlagsBits.ManageEvents)) {
    logger.warn(`Missing Manage Events permission in guild ${guild.id} — skipping Discord event`);
    return false;
  }
  return true;
}

/**
 * Build the Discord scheduled event fields for a Bifröst calendar event.
 * Returns null for all-day or past events, which Discord can't represent well.
 */
function buildEventOptions(event) {
  if (!event.event_time) return null;

  const start = combineDateTime(event.event_date, event.event_time);
  if (start.getTime() <= Date.now()) return null;

  return {
    name: (event.title || 'Event').substring(0, 100),
    scheduledStartTime: start,
    scheduledEndTime: new Date(start.getTime() + DEFAULT_DURATION_MS),
    privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
    entityType: GuildScheduledEventEntityType.External,
    entityMetadata: { location: 'Bifröst' },
    description: `Scheduled in Bifröst (event #${event.id})`
  };
}

/**
 * Create a Discord scheduled event for a Bifröst calendar event
 * @param {Guild} guild - Discord guild
 * @param {Object} event - Calendar event
 * @returns {Promise<GuildScheduledEvent|null>}
 */
async function createDiscordEvent(guild, event) {
  try {
    if (!canUseDiscordEvents(guild)) return null;
    if (scheduledEvents.has(key(guild.id, event.id))) return null;

    const options = buildEventOptions(event);
    if (!options) return null;

    const scheduled = await guild.scheduledEvents.create(options);
    scheduledEvents.set(key(guild.id, event.id), {
      scheduledEventId: scheduled.id,
      createdAt: new Date().toISOString()
    });
    save();

    logger.info(`Created Discord event ${scheduled.id} for Bifröst event ${event.id} in guild ${guild.id}`);
    return scheduled;
  } catch (error) {
    logger.error(`Failed to create Discord event for event ${event.id}:`, error);
    return null;
  }
}

/**
 * Move a Discord scheduled event to the Bifröst event's new time
 */
async function updateDiscordEvent(guild, event) {
  const entry = scheduledEvents.get(key(guild.id, event.id));
  if (!entry) return createDiscordEvent(guild, event);

  try {
    const options = buildEventOptions(event);
    if (!options) return deleteDiscordEvent(guild, event.id);

    const scheduled = await guild.scheduledEvents.edit(entry.scheduledEventId, {
      name: options.name,
      scheduledStartTime: options.scheduledStartTime,
      scheduledEndTime: options.scheduledEndTime
    });
    logger.info(`Updated Discord event ${entry.scheduledEventId} for Bifröst event ${event.id}`);
    return scheduled;
  } catch (error) {
    logger.error(`Failed to update Discord event for event ${event.id}:`, error);
    return null;
  }
}

/**
 * Delete the Discord scheduled event for a Bifröst event
 */
async function deleteDiscordEvent(guild, eventId) {
  const entry = scheduledEvents.get(key(guild.id, eventId));
  if (!entry) return null;

  scheduledEvents.delete(key(guild.id, eventId));
  save();

  try {
    await guild.scheduledEvents.delete(entry.scheduledEventId);
    logger.info(`Deleted Discord event ${entry.scheduledEventId} for Bifröst event ${eventId}`);
  } catch (error) {
    // Already deleted by someone in Discord, or it ended
    logger.warn(`Could not delete Discord event ${entry.scheduledEventId}: ${error.message}`);
  }
  return null;
}

/**
 * Get the IDs of members who marked the Discord event "Interested"
 * @returns {Promise<string[]>}
 */
async function getInterestedUserIds(guild, eventId) {
  const entry = scheduledEvents.get(key(guild.id, eventId));
  if (!entry) return [];

  try {
    const subscribers = await guild.scheduledEvents.fetchSubscribers(entry.scheduledEventId);
    return [...subscribers.values()]
      .filter(s => !s.user.bot)
      .map(s => s.user.id);
  } catch (error) {
    logger.warn(`Could not fetch interested members for event ${eventId}: ${error.message}`);
    return [];
  }
}

load();

module.exports = {
  createDiscordEvent,
  updateDiscordEvent,
  deleteDiscordEvent,
  getInterestedUserIds
};
