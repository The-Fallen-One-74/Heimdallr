const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const TRACKER_DIR = path.join(__dirname, '../../config');
const TRACKER_FILE = path.join(TRACKER_DIR, 'sent-reminders.json');

// In-memory cache of sent reminders
let sentReminders = new Map();

/**
 * Load sent reminders from file
 */
function loadReminders() {
  try {
    if (!fs.existsSync(TRACKER_DIR)) {
      fs.mkdirSync(TRACKER_DIR, { recursive: true });
    }

    if (fs.existsSync(TRACKER_FILE)) {
      const data = fs.readFileSync(TRACKER_FILE, 'utf8');
      const reminders = JSON.parse(data);
      sentReminders = new Map(Object.entries(reminders));
      
      // Clean up old reminders (older than 7 days)
      cleanupOldReminders();
      
      logger.info(`Loaded ${sentReminders.size} sent reminder(s)`);
    }
  } catch (error) {
    logger.error('Failed to load sent reminders:', error);
  }
}

/**
 * Save sent reminders to file
 */
function saveReminders() {
  try {
    if (!fs.existsSync(TRACKER_DIR)) {
      fs.mkdirSync(TRACKER_DIR, { recursive: true });
    }

    const reminders = Object.fromEntries(sentReminders);
    fs.writeFileSync(TRACKER_FILE, JSON.stringify(reminders, null, 2));
  } catch (error) {
    logger.error('Failed to save sent reminders:', error);
  }
}

/**
 * Generate a unique key for a reminder
 * @param {string} guildId - Guild ID
 * @param {string} eventId - Event ID
 * @param {number} reminderTime - Reminder time in minutes
 * @returns {string}
 */
function getReminderKey(guildId, eventId, reminderTime) {
  return `${guildId}:${eventId}:${reminderTime}`;
}

/**
 * Check if a reminder has been sent
 * @param {string} guildId - Guild ID
 * @param {string} eventId - Event ID
 * @param {number} reminderTime - Reminder time in minutes
 * @returns {boolean}
 */
function hasBeenSent(guildId, eventId, reminderTime) {
  const key = getReminderKey(guildId, eventId, reminderTime);
  return sentReminders.has(key);
}

/**
 * Mark a reminder as sent
 * @param {string} guildId - Guild ID
 * @param {string} eventId - Event ID
 * @param {number} reminderTime - Reminder time in minutes
 * @param {string} eventTitle - Event title for logging
 */
function markAsSent(guildId, eventId, reminderTime, eventTitle) {
  const key = getReminderKey(guildId, eventId, reminderTime);
  sentReminders.set(key, {
    sentAt: new Date().toISOString(),
    eventTitle: eventTitle
  });
  saveReminders();
  logger.info(`Marked reminder as sent: ${eventTitle} (${reminderTime}min)`);
}

/**
 * Clean up reminders older than 7 days
 */
function cleanupOldReminders() {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  let cleaned = 0;
  for (const [key, value] of sentReminders.entries()) {
    const sentDate = new Date(value.sentAt);
    if (sentDate < sevenDaysAgo) {
      sentReminders.delete(key);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    logger.info(`Cleaned up ${cleaned} old reminder(s)`);
    saveReminders();
  }
}

/**
 * Clear all sent reminders (for testing)
 */
function clearAll() {
  sentReminders.clear();
  saveReminders();
  logger.info('Cleared all sent reminders');
}

// Load reminders on startup
loadReminders();

module.exports = {
  hasBeenSent,
  markAsSent,
  cleanupOldReminders,
  clearAll
};
