const { EmbedBuilder } = require('discord.js');

/**
 * Convert event_date + event_time (UTC) to a Unix timestamp
 * @param {string} dateStr - YYYY-MM-DD
 * @param {string} timeStr - HH:MM (UTC)
 * @returns {number} Unix timestamp in seconds
 */
function toUnixTimestamp(dateStr, timeStr) {
  if (!dateStr) return Math.floor(Date.now() / 1000);
  const utcStr = timeStr ? `${dateStr}T${timeStr}:00Z` : `${dateStr}T00:00:00Z`;
  return Math.floor(new Date(utcStr).getTime() / 1000);
}

/**
 * Format a Discord timestamp string
 * F = full date+time, R = relative, t = short time, D = long date
 * @param {number} unix - Unix timestamp
 * @param {string} style - Discord timestamp style
 * @returns {string}
 */
function discordTimestamp(unix, style = 'F') {
  return `<t:${unix}:${style}>`;
}

/**
 * Create an embed for a calendar event
 * @param {Object} event - Calendar event object
 * @returns {EmbedBuilder}
 */
function createEventEmbed(event) {
  const eventType = event.type || 'other';
  const unix = toUnixTimestamp(event.event_date, event.event_time);

  const embed = new EmbedBuilder()
    .setTitle(event.title || 'Event')
    .setColor(getEventColor(eventType));

  const fields = [
    { name: '📅 When', value: `${discordTimestamp(unix, 'F')}\n${discordTimestamp(unix, 'R')}`, inline: true },
    { name: '🏷️ Type', value: formatEventType(eventType), inline: true }
  ];

  embed.addFields(fields);
  return embed;
}

/**
 * Build message content with Discord timestamp for notifications
 * @param {Object} event - Calendar event
 * @param {string} prefix - Message prefix (e.g., mentions)
 * @returns {string}
 */
function buildEventContent(event, prefix = '') {
  const unix = toUnixTimestamp(event.event_date, event.event_time);
  const parts = [];
  if (prefix) parts.push(prefix);
  parts.push(`📅 **${event.title}** — ${discordTimestamp(unix, 'F')} (${discordTimestamp(unix, 'R')})`);
  return parts.join('\n');
}

/**
 * Create an embed for a meeting
 */
function createMeetingEmbed(meeting) {
  const embed = createEventEmbed(meeting);
  embed.setColor(0x5865F2);
  return embed;
}

/**
 * Get color based on event type
 */
function getEventColor(eventType) {
  const colors = {
    meeting: 0x5865F2,
    work_session: 0x57F287,
    social: 0xFEE75C,
    training: 0xEB459E,
    holiday: 0xFFA500,
    deadline: 0xFF0000,
    birthday: 0xFF69B4,
    other: 0x99AAB5
  };
  return colors[eventType] || colors.other;
}

/**
 * Format event type for display
 */
function formatEventType(eventType) {
  const types = {
    meeting: '📅 Meeting',
    work_session: '💼 Work Session',
    social: '🎉 Social',
    training: '📚 Training',
    holiday: '🏖️ Holiday',
    deadline: '⏰ Deadline',
    birthday: '🎂 Birthday',
    other: '📌 Other'
  };
  return types[eventType] || eventType;
}

/**
 * Format date and time for display using Discord timestamp
 */
function formatDateTime(dateStr, timeStr) {
  const unix = toUnixTimestamp(dateStr, timeStr);
  return discordTimestamp(unix, 'F');
}

module.exports = {
  createEventEmbed,
  createMeetingEmbed,
  buildEventContent,
  toUnixTimestamp,
  discordTimestamp,
  formatDateTime,
  formatEventType
};
