const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const TRACKER_DIR = path.join(__dirname, '../../config');
const TRACKER_FILE = path.join(TRACKER_DIR, 'rsvps.json');

// In-memory cache of RSVPs
let rsvps = new Map();

/**
 * Load RSVPs from file
 */
function loadRSVPs() {
  try {
    if (!fs.existsSync(TRACKER_DIR)) {
      fs.mkdirSync(TRACKER_DIR, { recursive: true });
    }

    if (fs.existsSync(TRACKER_FILE)) {
      const data = fs.readFileSync(TRACKER_FILE, 'utf8');
      const rsvpData = JSON.parse(data);
      rsvps = new Map(Object.entries(rsvpData));
      logger.info(`Loaded ${rsvps.size} RSVP record(s)`);
    }
  } catch (error) {
    logger.error('Failed to load RSVPs:', error);
  }
}

/**
 * Save RSVPs to file
 */
function saveRSVPs() {
  try {
    if (!fs.existsSync(TRACKER_DIR)) {
      fs.mkdirSync(TRACKER_DIR, { recursive: true });
    }

    const rsvpData = Object.fromEntries(rsvps);
    fs.writeFileSync(TRACKER_FILE, JSON.stringify(rsvpData, null, 2));
  } catch (error) {
    logger.error('Failed to save RSVPs:', error);
  }
}

/**
 * Get RSVP key
 * @param {string} guildId - Guild ID
 * @param {string} messageId - Message ID
 * @returns {string}
 */
function getRSVPKey(guildId, messageId) {
  return `${guildId}:${messageId}`;
}

/**
 * Track an RSVP
 * @param {string} guildId - Guild ID
 * @param {string} messageId - Message ID
 * @param {string} userId - User ID
 * @param {string} userTag - User tag
 * @param {string} status - RSVP status (accepted, declined, maybe)
 * @param {string} eventTitle - Event title
 */
function trackRSVP(guildId, messageId, userId, userTag, status, eventTitle) {
  const key = getRSVPKey(guildId, messageId);
  
  if (!rsvps.has(key)) {
    rsvps.set(key, {
      eventTitle: eventTitle,
      responses: {}
    });
  }

  const rsvpData = rsvps.get(key);
  rsvpData.responses[userId] = {
    userTag: userTag,
    status: status,
    timestamp: new Date().toISOString()
  };

  saveRSVPs();
}

/**
 * Get RSVP statistics for a message
 * @param {string} guildId - Guild ID
 * @param {string} messageId - Message ID
 * @returns {Object} Stats object with accepted, declined, maybe counts
 */
function getRSVPStats(guildId, messageId) {
  const key = getRSVPKey(guildId, messageId);
  const rsvpData = rsvps.get(key);

  if (!rsvpData) {
    return { accepted: 0, declined: 0, maybe: 0 };
  }

  const stats = { accepted: 0, declined: 0, maybe: 0 };
  
  for (const response of Object.values(rsvpData.responses)) {
    stats[response.status]++;
  }

  return stats;
}

/**
 * Get all RSVPs for a message
 * @param {string} guildId - Guild ID
 * @param {string} messageId - Message ID
 * @returns {Array} Array of RSVP objects
 */
function getRSVPs(guildId, messageId) {
  const key = getRSVPKey(guildId, messageId);
  const rsvpData = rsvps.get(key);

  if (!rsvpData) {
    return [];
  }

  return Object.entries(rsvpData.responses).map(([userId, data]) => ({
    userId,
    ...data
  }));
}

// Load RSVPs on startup
loadRSVPs();

module.exports = {
  trackRSVP,
  getRSVPStats,
  getRSVPs
};
