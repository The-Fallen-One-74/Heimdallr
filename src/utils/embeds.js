const { EmbedBuilder } = require('discord.js');

/**
 * Create an embed for an event
 * @param {Object} event - Event object
 * @returns {EmbedBuilder}
 */
function createEventEmbed(event) {
  const eventDate = event.datetime || combineDateTime(event.start_date, event.start_time);
  const eventType = event.event_type || event.type;
  
  const embed = new EmbedBuilder()
    .setTitle(event.title || 'Event')
    .setColor(getEventColor(eventType))
    .setTimestamp(eventDate);

  if (event.description) {
    embed.setDescription(event.description);
  }

  embed.addFields(
    { name: '📅 Date', value: formatDate(eventDate), inline: true },
    { name: '🏷️ Type', value: formatEventType(eventType), inline: true }
  );

  if (event.location) {
    embed.addFields({ name: '📍 Location', value: event.location, inline: true });
  }

  return embed;
}

/**
 * Combine date and time strings into a Date object
 * @param {string} dateStr - Date string
 * @param {string} timeStr - Time string
 * @returns {Date}
 */
function combineDateTime(dateStr, timeStr) {
  if (!dateStr) return new Date();
  if (timeStr) {
    return new Date(`${dateStr}T${timeStr}`);
  }
  return new Date(dateStr);
}

/**
 * Create an embed for a sprint
 * @param {Object} sprint - Sprint object
 * @returns {EmbedBuilder}
 */
function createSprintEmbed(sprint) {
  const embed = new EmbedBuilder()
    .setTitle(`🏃 ${sprint.name || 'Sprint'}`)
    .setColor(0x00D9FF)
    .setTimestamp();

  if (sprint.goal) {
    embed.setDescription(`**Goal:** ${sprint.goal}`);
  }

  embed.addFields(
    { name: '🚀 Start Date', value: formatDate(sprint.start_date), inline: true },
    { name: '🏁 End Date', value: formatDate(sprint.end_date), inline: true },
    { name: '📊 Status', value: getSprintStatus(sprint), inline: true }
  );

  return embed;
}

/**
 * Create an embed for a meeting
 * @param {Object} meeting - Meeting object
 * @returns {EmbedBuilder}
 */
function createMeetingEmbed(meeting) {
  const meetingDate = meeting.datetime || combineDateTime(meeting.start_date, meeting.start_time);
  
  const embed = new EmbedBuilder()
    .setTitle(`📅 ${meeting.title || 'Meeting'}`)
    .setColor(0x5865F2)
    .setTimestamp(meetingDate);

  if (meeting.description) {
    embed.setDescription(meeting.description);
  }

  embed.addFields(
    { name: '⏰ Time', value: formatDateTime(meetingDate), inline: true }
  );

  if (meeting.location) {
    embed.addFields({ name: '📍 Location', value: meeting.location, inline: true });
  }

  return embed;
}

/**
 * Get color based on event type
 * @param {string} eventType - Event type
 * @returns {number} Color hex
 */
function getEventColor(eventType) {
  const colors = {
    meeting: 0x5865F2,
    sprint: 0x00D9FF,
    holiday: 0xFFA500,
    deadline: 0xFF0000,
    celebration: 0x00FF00
  };
  return colors[eventType] || 0x808080;
}

/**
 * Format event type for display
 * @param {string} eventType - Event type
 * @returns {string}
 */
function formatEventType(eventType) {
  const types = {
    meeting: '📅 Meeting',
    sprint: '🏃 Sprint',
    holiday: '🎉 Holiday',
    deadline: '⏰ Deadline',
    celebration: '🎊 Celebration'
  };
  return types[eventType] || eventType;
}

/**
 * Format date for display
 * @param {string} dateString - ISO date string
 * @returns {string}
 */
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

/**
 * Format date and time for display
 * @param {string} dateString - ISO date string
 * @returns {string}
 */
function formatDateTime(dateString) {
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

/**
 * Get sprint status
 * @param {Object} sprint - Sprint object
 * @returns {string}
 */
function getSprintStatus(sprint) {
  const now = new Date();
  const start = new Date(sprint.start_date);
  const end = new Date(sprint.end_date);

  if (now < start) {
    return '⏳ Upcoming';
  } else if (now > end) {
    return '✅ Completed';
  } else {
    return '🔥 Active';
  }
}

module.exports = {
  createEventEmbed,
  createSprintEmbed,
  createMeetingEmbed,
  formatDate,
  formatDateTime,
  formatEventType,
  combineDateTime
};
