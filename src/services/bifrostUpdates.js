const { EmbedBuilder } = require('discord.js');
const { getBifrostClient } = require('./bifrostClient');
const { sendToOrganization } = require('./notificationService');
const { discordTimestamp, toUnixTimestamp } = require('../utils/embeds');
const logger = require('../utils/logger');

const ANNOUNCEMENT_COLORS = {
  info: 0x5865F2,
  important: 0xFF9900,
  critical: 0xFF0000
};

/**
 * Post a new Bifröst announcement to the organization's Discord servers
 * @param {Client} client - Discord client
 * @param {Object} announcement - announcements row
 * @returns {Promise<Message[]>}
 */
async function postAnnouncement(client, announcement) {
  if (announcement.status && announcement.status !== 'active') return [];

  const priority = announcement.priority || 'info';
  const embed = new EmbedBuilder()
    .setColor(ANNOUNCEMENT_COLORS[priority] || ANNOUNCEMENT_COLORS.info)
    .setTitle(`📢 ${announcement.title}`.substring(0, 256))
    .setDescription(String(announcement.body || '').substring(0, 4096))
    .setFooter({ text: priority === 'info' ? 'Bifröst announcement' : `Bifröst announcement · ${priority}` })
    .setTimestamp(announcement.created_at ? new Date(announcement.created_at) : new Date());

  if (announcement.expires_at) {
    const unix = Math.floor(new Date(announcement.expires_at).getTime() / 1000);
    embed.addFields({ name: 'Until', value: discordTimestamp(unix, 'F'), inline: true });
  }

  return sendToOrganization(client, announcement.organization_id, () => ({ embeds: [embed] }));
}

/**
 * Look up the project a sprint belongs to
 */
async function getProject(projectId) {
  const { data, error } = await getBifrostClient()
    .from('projects')
    .select('id, name, organization_id')
    .eq('id', projectId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Count a sprint's tasks, and how many are done
 */
async function getSprintTaskCounts(sprintId) {
  const { data, error } = await getBifrostClient()
    .from('tasks')
    .select('column_id')
    .eq('sprint_id', sprintId);

  if (error) throw error;
  const tasks = data || [];
  return {
    total: tasks.length,
    done: tasks.filter(t => t.column_id === 'done').length
  };
}

const dateStamp = date => discordTimestamp(toUnixTimestamp(date, null), 'D');

/**
 * Post when a sprint starts or completes
 * @param {Client} client - Discord client
 * @param {Object} sprint - sprints row after the change
 * @param {Object|null} previous - sprints row before the change
 * @returns {Promise<Message[]>}
 */
async function postSprintChange(client, sprint, previous) {
  if (previous && previous.status === sprint.status) return [];
  if (sprint.status !== 'active' && sprint.status !== 'completed') return [];

  const project = await getProject(sprint.project_id);
  if (!project) {
    logger.warn(`Sprint ${sprint.id} has no project — skipping`);
    return [];
  }

  const counts = await getSprintTaskCounts(sprint.id);
  const embed = new EmbedBuilder().setTimestamp();

  if (sprint.status === 'active') {
    embed
      .setColor(0x57F287)
      .setTitle(`🏃 Sprint Started: ${sprint.name}`.substring(0, 256))
      .addFields(
        { name: 'Project', value: project.name, inline: true },
        { name: 'Dates', value: `${dateStamp(sprint.start_date)} → ${dateStamp(sprint.end_date)}`, inline: true },
        { name: 'Tasks', value: String(counts.total), inline: true }
      );
    if (sprint.goal) embed.setDescription(`**Goal:** ${sprint.goal}`.substring(0, 4096));
  } else {
    const carried = counts.total - counts.done;
    embed
      .setColor(0x5865F2)
      .setTitle(`🏁 Sprint Complete: ${sprint.name}`.substring(0, 256))
      .addFields(
        { name: 'Project', value: project.name, inline: true },
        { name: 'Done', value: `${counts.done} of ${counts.total}`, inline: true },
        { name: 'Not finished', value: String(carried), inline: true }
      );
    if (sprint.goal) embed.setDescription(`**Goal was:** ${sprint.goal}`.substring(0, 4096));
  }

  return sendToOrganization(client, project.organization_id, () => ({ embeds: [embed] }));
}

module.exports = {
  postAnnouncement,
  postSprintChange
};
