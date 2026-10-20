const cron = require('node-cron');
const { EmbedBuilder } = require('discord.js');
const { getBifrostClient } = require('./bifrostClient');
const { getGuildConfig, saveGuildConfig } = require('./configManager');
const { sendNotification } = require('./notificationService');
const { getDepartmentRoleMention } = require('./departmentRoles');
const { discordTimestamp, toUnixTimestamp } = require('../utils/embeds');
const logger = require('../utils/logger');

// Milestones due within this many days are listed
const MILESTONE_LOOKAHEAD_DAYS = 3;

const DEFAULTS = {
  enabled: true,
  hour: 9,
  out_today: false,
  milestones: true
};

let job = null;

/**
 * A guild's daily post settings, with defaults filled in
 */
function getDailySettings(config) {
  return { ...DEFAULTS, ...(config?.daily || {}) };
}

/**
 * The local date (YYYY-MM-DD) and hour in a timezone
 */
function getLocalNow(timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit'
  }).formatToParts(new Date());
  const get = type => parts.find(p => p.type === type).value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: parseInt(get('hour')) };
}

function addDays(dateStr, days) {
  const date = new Date(`${dateStr}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().substring(0, 10);
}

/**
 * Names of people with approved time off on a date. Only names are
 * returned — never the type or reason of the request.
 */
async function getOutToday(orgId, dateStr) {
  const client = getBifrostClient();
  const { data: requests, error } = await client
    .from('time_off_requests')
    .select('user_id')
    .eq('organization_id', orgId)
    .eq('status', 'approved')
    .lte('start_date', dateStr)
    .gte('end_date', dateStr);

  if (error) throw error;
  const userIds = [...new Set((requests || []).map(r => r.user_id))];
  if (userIds.length === 0) return [];

  const { data: users, error: usersError } = await client
    .from('users')
    .select('first_name, last_name')
    .in('id', userIds);

  if (usersError) throw usersError;
  return (users || [])
    .map(u => `${u.first_name} ${u.last_name}`.trim())
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Unfinished milestones due between two dates, with their project names
 */
async function getUpcomingMilestones(orgId, fromDate, toDate) {
  const client = getBifrostClient();
  const { data: projects, error: projectsError } = await client
    .from('projects')
    .select('id, name')
    .eq('organization_id', orgId);

  if (projectsError) throw projectsError;
  if (!projects || projects.length === 0) return [];

  const projectNames = new Map(projects.map(p => [p.id, p.name]));
  const { data, error } = await client
    .from('milestones')
    .select('id, title, due_date, status, department_id, project_id')
    .in('project_id', [...projectNames.keys()])
    .neq('status', 'completed')
    .gte('due_date', fromDate)
    .lte('due_date', toDate)
    .order('due_date', { ascending: true });

  if (error) throw error;
  return (data || []).map(m => ({ ...m, project_name: projectNames.get(m.project_id) }));
}

/**
 * Build and send a guild's daily post. Sends nothing when there is nothing to say.
 * @returns {Promise<boolean>} Whether a post was sent
 */
async function sendDailyPost(client, guildId, config, today) {
  const settings = getDailySettings(config);
  const embeds = [];
  const roleMentions = new Set();

  if (settings.out_today) {
    const names = await getOutToday(config.organization_id, today);
    if (names.length > 0) {
      embeds.push(new EmbedBuilder()
        .setColor(0xFEE75C)
        .setTitle('🌴 Out Today')
        .setDescription(names.join('\n').substring(0, 4096)));
    }
  }

  if (settings.milestones) {
    const milestones = await getUpcomingMilestones(
      config.organization_id, today, addDays(today, MILESTONE_LOOKAHEAD_DAYS)
    );
    if (milestones.length > 0) {
      const lines = milestones.map(m => {
        const role = getDepartmentRoleMention(guildId, m.department_id);
        if (role) roleMentions.add(role);
        const when = m.due_date === today
          ? '**due today**'
          : `due ${discordTimestamp(toUnixTimestamp(m.due_date, null), 'D')}`;
        return `🎯 **${m.title}** (${m.project_name}) — ${when}${role ? ` ${role}` : ''}`;
      });
      embeds.push(new EmbedBuilder()
        .setColor(0xEB459E)
        .setTitle('🎯 Milestones Coming Up')
        .setDescription(lines.join('\n').substring(0, 4096)));
    }
  }

  if (embeds.length === 0) return false;

  embeds[embeds.length - 1].setFooter({ text: 'Heimdallr daily update' }).setTimestamp();
  const content = roleMentions.size > 0 ? [...roleMentions].join(' ') : undefined;
  const message = await sendNotification(client, guildId, { embeds, content });
  return message !== null;
}

/**
 * Send the daily post for every guild whose local posting hour is now
 */
async function checkDailyPosts(client) {
  for (const [guildId] of client.guilds.cache) {
    try {
      const config = getGuildConfig(guildId);
      if (!config?.organization_id || !config.notification_channel_id) continue;

      const settings = getDailySettings(config);
      if (!settings.enabled) continue;

      const { date, hour } = getLocalNow(config.timezone || 'America/New_York');
      if (hour !== settings.hour || config.daily_last_posted === date) continue;

      // Mark first so a failure doesn't repeat the post every hour
      saveGuildConfig(guildId, { daily_last_posted: date });
      const sent = await sendDailyPost(client, guildId, config, date);
      if (sent) logger.info(`Sent daily post to guild ${guildId} for ${date}`);
    } catch (error) {
      logger.error(`Failed daily post for guild ${guildId}:`, error);
    }
  }
}

/**
 * Start the daily post scheduler (checks at the top of every hour)
 */
function initDailyDigest(client) {
  job = cron.schedule('0 * * * *', () => checkDailyPosts(client));
  logger.info('Daily post scheduler initialized — checking hourly');
}

function stopDailyDigest() {
  if (job) job.stop();
  job = null;
}

module.exports = {
  initDailyDigest,
  stopDailyDigest,
  getDailySettings,
  sendDailyPost,
  getLocalNow
};
