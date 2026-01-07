const logger = require('../utils/logger');

// In-memory storage for RSVPs
// Structure: Map<eventId, Map<userId, reaction>>
const rsvpData = new Map();

/**
 * Track an RSVP for an event
 * @param {string} eventId - Event ID
 * @param {string} userId - User ID
 * @param {string} reaction - Reaction emoji (✅, ❌, ❓)
 */
function trackRSVP(eventId, userId, reaction) {
  if (!rsvpData.has(eventId)) {
    rsvpData.set(eventId, new Map());
  }
  
  const eventRSVPs = rsvpData.get(eventId);
  const previousReaction = eventRSVPs.get(userId);
  
  eventRSVPs.set(userId, reaction);
  
  logger.info(`RSVP tracked: Event ${eventId}, User ${userId}, Reaction ${reaction}${previousReaction ? ` (changed from ${previousReaction})` : ''}`);
}

/**
 * Remove an RSVP for an event
 * @param {string} eventId - Event ID
 * @param {string} userId - User ID
 */
function removeRSVP(eventId, userId) {
  if (!rsvpData.has(eventId)) {
    return;
  }
  
  const eventRSVPs = rsvpData.get(eventId);
  const removed = eventRSVPs.delete(userId);
  
  if (removed) {
    logger.info(`RSVP removed: Event ${eventId}, User ${userId}`);
  }
  
  // Clean up empty event maps
  if (eventRSVPs.size === 0) {
    rsvpData.delete(eventId);
  }
}

/**
 * Get RSVP statistics for an event
 * @param {string} eventId - Event ID
 * @returns {Object} RSVP stats with counts for each reaction
 */
function getRSVPStats(eventId) {
  if (!rsvpData.has(eventId)) {
    return {
      yes: 0,
      no: 0,
      maybe: 0,
      total: 0,
      users: []
    };
  }
  
  const eventRSVPs = rsvpData.get(eventId);
  const stats = {
    yes: 0,
    no: 0,
    maybe: 0,
    total: eventRSVPs.size,
    users: []
  };
  
  for (const [userId, reaction] of eventRSVPs.entries()) {
    if (reaction === '✅') {
      stats.yes++;
    } else if (reaction === '❌') {
      stats.no++;
    } else if (reaction === '❓') {
      stats.maybe++;
    }
    
    stats.users.push({ userId, reaction });
  }
  
  return stats;
}

/**
 * Get all RSVPs for an event
 * @param {string} eventId - Event ID
 * @returns {Map<string, string>} Map of userId to reaction
 */
function getEventRSVPs(eventId) {
  return rsvpData.get(eventId) || new Map();
}

/**
 * Clear all RSVPs for an event
 * @param {string} eventId - Event ID
 */
function clearEventRSVPs(eventId) {
  const deleted = rsvpData.delete(eventId);
  if (deleted) {
    logger.info(`Cleared all RSVPs for event ${eventId}`);
  }
}

/**
 * Get total number of events being tracked
 * @returns {number} Number of events with RSVPs
 */
function getTrackedEventCount() {
  return rsvpData.size;
}

module.exports = {
  trackRSVP,
  removeRSVP,
  getRSVPStats,
  getEventRSVPs,
  clearEventRSVPs,
  getTrackedEventCount
};
