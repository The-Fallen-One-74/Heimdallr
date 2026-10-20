/**
 * Parse a 12-hour time like "9:00 AM" or "2:30pm" into 24-hour "HH:MM"
 * @param {string} timeStr
 * @returns {string|null} "HH:MM" or null if invalid
 */
function parseTime12h(timeStr) {
  const match = timeStr.trim().match(/^(0?[1-9]|1[0-2]):([0-5][0-9])\s?(AM|PM)$/i);
  if (!match) return null;

  let hours = parseInt(match[1]);
  const period = match[3].toUpperCase();
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  return `${hours.toString().padStart(2, '0')}:${match[2]}`;
}

/**
 * Offset of a timezone from UTC at a given instant, in minutes
 */
function getOffsetMinutes(timeZone, date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(date);

  const get = type => parseInt(parts.find(p => p.type === type).value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - date.getTime()) / 60000);
}

/**
 * Convert a local date + time in a timezone to the UTC pair Bifröst stores
 * in calendar_events.event_date / event_time
 * @param {string} dateStr - YYYY-MM-DD (local)
 * @param {string} time24 - HH:MM (local)
 * @param {string} timeZone - IANA timezone, e.g. America/New_York
 * @returns {{ event_date: string, event_time: string }}
 */
function localToUtc(dateStr, time24, timeZone = 'UTC') {
  const naiveUtc = new Date(`${dateStr}T${time24}:00Z`);

  // Apply the offset, then re-check it at the resulting instant so dates
  // near a DST switch use the offset that is actually in effect
  let instant = new Date(naiveUtc.getTime() - getOffsetMinutes(timeZone, naiveUtc) * 60000);
  instant = new Date(naiveUtc.getTime() - getOffsetMinutes(timeZone, instant) * 60000);

  const iso = instant.toISOString();
  return {
    event_date: iso.substring(0, 10),
    event_time: iso.substring(11, 16)
  };
}

module.exports = {
  parseTime12h,
  localToUtc
};
