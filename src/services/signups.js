const { createJsonStore } = require('../utils/jsonStore');
const logger = require('../utils/logger');

// Statuses match calendar_event_signups.status in the Bifröst design, so the
// store can move to Bifröst without changing what members see
const SIGNUP_STATUSES = ['going', 'maybe', 'not_going'];

// "guildId:eventId" → { updatedAt, users: { discordUserId: status } }
const store = createJsonStore('signups.json', { maxAgeDays: 60 });

const key = (guildId, eventId) => `${guildId}:${eventId}`;

/**
 * Record a member's answer for an event
 * @returns {boolean} false when the status is not valid
 */
function setSignup(guildId, eventId, userId, status) {
  if (!SIGNUP_STATUSES.includes(status)) return false;

  const entry = store.map.get(key(guildId, eventId)) || { users: {} };
  entry.users[userId] = status;
  entry.updatedAt = new Date().toISOString();
  store.map.set(key(guildId, eventId), entry);
  store.save();

  logger.info(`Sign-up: event ${eventId} in guild ${guildId}, user ${userId} → ${status}`);
  return true;
}

/**
 * Members grouped by answer
 * @returns {{ going: string[], maybe: string[], not_going: string[] }}
 */
function getSignups(guildId, eventId) {
  const groups = { going: [], maybe: [], not_going: [] };
  const entry = store.map.get(key(guildId, eventId));
  for (const [userId, status] of Object.entries(entry?.users || {})) {
    groups[status]?.push(userId);
  }
  return groups;
}

/**
 * Members to tag in reminders: everyone going or maybe
 * @returns {string[]}
 */
function getAttendeeIds(guildId, eventId) {
  const { going, maybe } = getSignups(guildId, eventId);
  return [...going, ...maybe];
}

module.exports = {
  SIGNUP_STATUSES,
  setSignup,
  getSignups,
  getAttendeeIds
};
