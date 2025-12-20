const { getBifrostClient } = require('./bifrostClient');
const { getGuildConfig } = require('./configManager');
const logger = require('../utils/logger');

/**
 * Get upcoming events for a guild
 * @param {string} guildId - Discord guild ID
 * @param {number} daysAhead - Number of days to look ahead
 * @returns {Array} Array of events
 */
async function getUpcomingEvents(guildId, daysAhead = 7) {
  const config = getGuildConfig(guildId);
  if (!config) {
    throw new Error('Guild not configured');
  }

  const client = getBifrostClient(guildId, config.supabase_url, config.supabase_key);
  if (!client) {
    throw new Error('Failed to connect to Bifröst');
  }

  const now = new Date();
  const future = new Date();
  future.setDate(future.getDate() + daysAhead);

  try {
    const { data, error } = await client
      .from('team_events')
      .select('*')
      .gte('start_date', now.toISOString().split('T')[0])
      .lte('start_date', future.toISOString().split('T')[0])
      .order('start_date', { ascending: true })
      .order('start_time', { ascending: true });

    if (error) throw error;
    
    // Combine start_date and start_time into a single datetime for easier handling
    const eventsWithDateTime = (data || []).map(event => ({
      ...event,
      datetime: combineDateTime(event.start_date, event.start_time, event.timezone)
    }));
    
    return eventsWithDateTime;
  } catch (error) {
    logger.error(`Failed to fetch events for guild ${guildId}:`, error);
    throw error;
  }
}

/**
 * Combine date and time into a single Date object
 * @param {string} dateStr - Date string (YYYY-MM-DD)
 * @param {string} timeStr - Time string (HH:MM:SS)
 * @param {string} timezone - Timezone string
 * @returns {Date}
 */
function combineDateTime(dateStr, timeStr, timezone) {
  if (!dateStr) return new Date();
  
  if (timeStr) {
    return new Date(`${dateStr}T${timeStr}`);
  }
  return new Date(dateStr);
}

/**
 * Get current sprint for a guild
 * @param {string} guildId - Discord guild ID
 * @returns {Object|null} Current sprint
 */
async function getCurrentSprint(guildId) {
  const config = getGuildConfig(guildId);
  if (!config) {
    throw new Error('Guild not configured');
  }

  const client = getBifrostClient(guildId, config.supabase_url, config.supabase_key);
  if (!client) {
    throw new Error('Failed to connect to Bifröst');
  }

  const now = new Date().toISOString();

  try {
    const { data, error } = await client
      .from('sprints')
      .select('*')
      .lte('start_date', now)
      .gte('end_date', now)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // No current sprint
      }
      throw error;
    }

    return data;
  } catch (error) {
    logger.error(`Failed to fetch current sprint for guild ${guildId}:`, error);
    throw error;
  }
}

/**
 * Get all sprints for a guild
 * @param {string} guildId - Discord guild ID
 * @param {number} limit - Number of sprints to fetch
 * @returns {Array} Array of sprints
 */
async function getSprints(guildId, limit = 10) {
  const config = getGuildConfig(guildId);
  if (!config) {
    throw new Error('Guild not configured');
  }

  const client = getBifrostClient(guildId, config.supabase_url, config.supabase_key);
  if (!client) {
    throw new Error('Failed to connect to Bifröst');
  }

  try {
    const { data, error } = await client
      .from('sprints')
      .select('*')
      .order('start_date', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  } catch (error) {
    logger.error(`Failed to fetch sprints for guild ${guildId}:`, error);
    throw error;
  }
}

/**
 * Get holidays for a guild
 * @param {string} guildId - Discord guild ID
 * @param {number} daysAhead - Number of days to look ahead
 * @returns {Array} Array of holidays
 */
async function getHolidays(guildId, daysAhead = 365) {
  const config = getGuildConfig(guildId);
  if (!config) {
    throw new Error('Guild not configured');
  }

  const client = getBifrostClient(guildId, config.supabase_url, config.supabase_key);
  if (!client) {
    throw new Error('Failed to connect to Bifröst');
  }

  const now = new Date();
  const future = new Date();
  future.setDate(future.getDate() + daysAhead);

  const nowStr = now.toISOString().split('T')[0];
  const futureStr = future.toISOString().split('T')[0];

  logger.info(`Fetching holidays from ${nowStr} to ${futureStr}`);

  try {
    const { data, error } = await client
      .from('holidays')
      .select('*')
      .gte('start_date', nowStr)
      .lte('start_date', futureStr)
      .order('start_date', { ascending: true });

    logger.info(`Query returned ${data?.length || 0} holidays`);
    if (error) {
      logger.error('Supabase error:', error);
      throw error;
    }
    
    // Add datetime field and normalize to match event structure
    const eventsWithDateTime = (data || []).map(holiday => ({
      ...holiday,
      title: holiday.name,
      datetime: new Date(holiday.start_date)
    }));
    
    return eventsWithDateTime;
  } catch (error) {
    logger.error(`Failed to fetch holidays for guild ${guildId}:`, error);
    throw error;
  }
}

/**
 * Create a new event
 * @param {string} guildId - Discord guild ID
 * @param {Object} eventData - Event data
 * @returns {Object} Created event
 */
async function createEvent(guildId, eventData) {
  const config = getGuildConfig(guildId);
  if (!config) {
    throw new Error('Guild not configured');
  }

  const client = getBifrostClient(guildId, config.supabase_url, config.supabase_key);
  if (!client) {
    throw new Error('Failed to connect to Bifröst');
  }

  try {
    const { data, error } = await client
      .from('team_events')
      .insert(eventData)
      .select()
      .single();

    if (error) throw error;
    logger.info(`Created event for guild ${guildId}: ${data.title}`);
    return data;
  } catch (error) {
    logger.error(`Failed to create event for guild ${guildId}:`, error);
    throw error;
  }
}

/**
 * Update an event
 * @param {string} guildId - Discord guild ID
 * @param {string} eventId - Event ID
 * @param {Object} updates - Fields to update
 * @returns {Object} Updated event
 */
async function updateEvent(guildId, eventId, updates) {
  const config = getGuildConfig(guildId);
  if (!config) {
    throw new Error('Guild not configured');
  }

  const client = getBifrostClient(guildId, config.supabase_url, config.supabase_key);
  if (!client) {
    throw new Error('Failed to connect to Bifröst');
  }

  try {
    const { data, error } = await client
      .from('team_events')
      .update(updates)
      .eq('id', eventId)
      .select()
      .single();

    if (error) throw error;
    logger.info(`Updated event ${eventId} for guild ${guildId}`);
    return data;
  } catch (error) {
    logger.error(`Failed to update event for guild ${guildId}:`, error);
    throw error;
  }
}

/**
 * Delete an event
 * @param {string} guildId - Discord guild ID
 * @param {string} eventId - Event ID
 * @returns {boolean}
 */
async function deleteEvent(guildId, eventId) {
  const config = getGuildConfig(guildId);
  if (!config) {
    throw new Error('Guild not configured');
  }

  const client = getBifrostClient(guildId, config.supabase_url, config.supabase_key);
  if (!client) {
    throw new Error('Failed to connect to Bifröst');
  }

  try {
    const { error } = await client
      .from('team_events')
      .delete()
      .eq('id', eventId);

    if (error) throw error;
    logger.info(`Deleted event ${eventId} for guild ${guildId}`);
    return true;
  } catch (error) {
    logger.error(`Failed to delete event for guild ${guildId}:`, error);
    throw error;
  }
}

module.exports = {
  getUpcomingEvents,
  getCurrentSprint,
  getSprints,
  getHolidays,
  createEvent,
  updateEvent,
  deleteEvent,
  combineDateTime
};
