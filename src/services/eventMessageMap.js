const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const MAP_DIR = path.join(__dirname, '../../config');
const MAP_FILE = path.join(MAP_DIR, 'event-messages.json');

// Maps event ID → { messageId, guildId, channelId }
let eventMessages = new Map();

function load() {
  try {
    if (!fs.existsSync(MAP_DIR)) fs.mkdirSync(MAP_DIR, { recursive: true });
    if (fs.existsSync(MAP_FILE)) {
      const data = JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'));
      eventMessages = new Map(Object.entries(data));

      // Clean entries older than 30 days
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      for (const [key, val] of eventMessages) {
        if (val.createdAt && new Date(val.createdAt).getTime() < cutoff) {
          eventMessages.delete(key);
        }
      }
    }
  } catch (e) {
    logger.error('Failed to load event-message map:', e);
  }
}

function save() {
  try {
    if (!fs.existsSync(MAP_DIR)) fs.mkdirSync(MAP_DIR, { recursive: true });
    fs.writeFileSync(MAP_FILE, JSON.stringify(Object.fromEntries(eventMessages), null, 2));
  } catch (e) {
    logger.error('Failed to save event-message map:', e);
  }
}

/**
 * Link a calendar event ID to a Discord message
 */
function linkEventToMessage(eventId, messageId, guildId, channelId) {
  eventMessages.set(String(eventId), {
    messageId,
    guildId,
    channelId,
    createdAt: new Date().toISOString()
  });
  save();
  logger.info(`Linked event ${eventId} → message ${messageId}`);
}

/**
 * Get the Discord message info for an event
 */
function getMessageForEvent(eventId) {
  return eventMessages.get(String(eventId)) || null;
}

/**
 * Remove mapping when event is deleted
 */
function unlinkEvent(eventId) {
  eventMessages.delete(String(eventId));
  save();
}

load();

module.exports = {
  linkEventToMessage,
  getMessageForEvent,
  unlinkEvent
};
