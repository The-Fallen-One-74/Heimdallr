const { getBifrostClient } = require('./bifrostClient');
const { getGuildConfig } = require('./configManager');
const logger = require('../utils/logger');

// Event IDs created from Discord, so the webhook doesn't announce them twice
const createdFromDiscord = new Set();

/**
 * Whether an event was created by this bot (via /schedule)
 * @param {number|string} eventId
 */
function wasCreatedFromDiscord(eventId) {
  return createdFromDiscord.has(String(eventId));
}

/**
 * Resolve the Bifröst user recorded as an event's creator.
 * calendar_events.created_by must be a real user, so default to the
 * organization's Owner unless BOT_USER_ID is set.
 * @param {number} orgId
 * @returns {Promise<string>} User UUID
 */
async function getEventCreatorId(orgId) {
  if (process.env.BOT_USER_ID) return process.env.BOT_USER_ID;

  const client = getBifrostClient();
  const { data: role, error: roleError } = await client
    .from('roles')
    .select('id')
    .eq('organization_id', orgId)
    .eq('name', 'Owner')
    .eq('is_system', true)
    .maybeSingle();

  if (roleError) throw roleError;
  if (!role) throw new Error(`No Owner role found for organization ${orgId}`);

  const { data: owners, error } = await client
    .from('user_roles')
    .select('user_id')
    .eq('organization_id', orgId)
    .eq('role_id', role.id)
    .order('assigned_at', { ascending: true })
    .limit(1);

  if (error) throw error;
  if (!owners || owners.length === 0) throw new Error(`No owner found for organization ${orgId}`);
  return owners[0].user_id;
}

/**
 * Get the organization_id for a guild, or throw
 */
function getOrgId(guildId) {
  const config = getGuildConfig(guildId);
  if (!config || !config.organization_id) {
    throw new Error('Guild not configured — run /setup first');
  }
  return config.organization_id;
}

/**
 * Get upcoming calendar events for a guild's organization
 * @param {string} guildId - Discord guild ID
 * @param {number} daysAhead - Number of days to look ahead
 * @returns {Array} Array of events
 */
async function getUpcomingEvents(guildId, daysAhead = 7) {
  const orgId = getOrgId(guildId);
  const client = getBifrostClient();
  if (!client) throw new Error('Bifröst client not initialized');

  const now = new Date();
  const future = new Date();
  future.setDate(future.getDate() + daysAhead);

  const nowStr = now.toISOString().split('T')[0];
  const futureStr = future.toISOString().split('T')[0];

  try {
    const { data, error } = await client
      .from('calendar_events')
      .select('*')
      .eq('organization_id', orgId)
      .gte('event_date', nowStr)
      .lte('event_date', futureStr)
      .order('event_date', { ascending: true })
      .order('event_time', { ascending: true });

    if (error) throw error;

    return (data || []).map(event => ({
      ...event,
      datetime: combineDateTime(event.event_date, event.event_time)
    }));
  } catch (error) {
    logger.error(`Failed to fetch events for guild ${guildId}:`, error);
    throw error;
  }
}

/**
 * Get events for a specific date
 * @param {string} guildId - Discord guild ID
 * @param {string} dateStr - Date string YYYY-MM-DD
 * @returns {Array}
 */
async function getEventsForDate(guildId, dateStr) {
  const orgId = getOrgId(guildId);
  const client = getBifrostClient();
  if (!client) throw new Error('Bifröst client not initialized');

  try {
    const { data, error } = await client
      .from('calendar_events')
      .select('*')
      .eq('organization_id', orgId)
      .eq('event_date', dateStr)
      .order('event_time', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (error) {
    logger.error(`Failed to fetch events for date ${dateStr}:`, error);
    throw error;
  }
}

/**
 * Create a new calendar event
 * @param {string} guildId - Discord guild ID
 * @param {Object} eventData - Event data (title, event_date, event_time, type)
 * @returns {Object} Created event
 */
async function createEvent(guildId, eventData) {
  const orgId = getOrgId(guildId);
  const client = getBifrostClient();
  if (!client) throw new Error('Bifröst client not initialized');

  try {
    const createdBy = await getEventCreatorId(orgId);
    const { data, error } = await client
      .from('calendar_events')
      .insert({
        ...eventData,
        organization_id: orgId,
        created_by: createdBy
      })
      .select()
      .single();

    if (error) throw error;
    createdFromDiscord.add(String(data.id));
    setTimeout(() => createdFromDiscord.delete(String(data.id)), 10 * 60 * 1000).unref();
    logger.info(`Created event "${data.title}" for org ${orgId}`);
    return data;
  } catch (error) {
    logger.error(`Failed to create event for guild ${guildId}:`, error);
    throw error;
  }
}

/**
 * Update a calendar event
 * @param {string} guildId - Discord guild ID
 * @param {number} eventId - Event ID
 * @param {Object} updates - Fields to update
 * @returns {Object} Updated event
 */
async function updateEvent(guildId, eventId, updates) {
  const orgId = getOrgId(guildId);
  const client = getBifrostClient();
  if (!client) throw new Error('Bifröst client not initialized');

  try {
    const { data, error } = await client
      .from('calendar_events')
      .update(updates)
      .eq('id', eventId)
      .eq('organization_id', orgId)
      .select()
      .single();

    if (error) throw error;
    logger.info(`Updated event ${eventId} for org ${orgId}`);
    return data;
  } catch (error) {
    logger.error(`Failed to update event ${eventId}:`, error);
    throw error;
  }
}

/**
 * Delete a calendar event
 * @param {string} guildId - Discord guild ID
 * @param {number} eventId - Event ID
 * @returns {boolean}
 */
async function deleteEvent(guildId, eventId) {
  const orgId = getOrgId(guildId);
  const client = getBifrostClient();
  if (!client) throw new Error('Bifröst client not initialized');

  try {
    const { error } = await client
      .from('calendar_events')
      .delete()
      .eq('id', eventId)
      .eq('organization_id', orgId);

    if (error) throw error;
    logger.info(`Deleted event ${eventId} for org ${orgId}`);
    return true;
  } catch (error) {
    logger.error(`Failed to delete event ${eventId}:`, error);
    throw error;
  }
}

/**
 * Combine date and time into a UTC Date object
 * event_time is stored as UTC in Bifrost
 */
function combineDateTime(dateStr, timeStr) {
  if (!dateStr) return new Date();
  if (timeStr) return new Date(`${dateStr}T${timeStr}:00Z`);
  return new Date(`${dateStr}T00:00:00Z`);
}

module.exports = {
  getUpcomingEvents,
  getEventsForDate,
  createEvent,
  updateEvent,
  deleteEvent,
  combineDateTime,
  wasCreatedFromDiscord
};
