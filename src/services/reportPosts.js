const { createJsonStore } = require('../utils/jsonStore');
const { describeStatusChange } = require('../utils/reportStatus');
const { getGuildConfig } = require('./configManager');
const { ensureLiveConnection } = require('./connectionStatus');
const logger = require('../utils/logger');

// Bifröst task ID → where the report was filed in Discord
const store = createJsonStore('report-posts.json', { maxAgeDays: 180 });

/**
 * Remember the Discord message for a /bug or /feature report
 * @param {Object} post
 * @param {number} post.taskId
 * @param {string} post.guildId
 * @param {string} post.channelId
 * @param {string} post.messageId
 * @param {'bug'|'feature'} post.type
 * @param {string} post.title
 * @param {string} post.reporterId - Discord user who filed it
 */
function trackReportPost(post) {
  store.map.set(String(post.taskId), { ...post, updatedAt: new Date().toISOString() });
  store.save();
}

function getReportPost(taskId) {
  return store.map.get(String(taskId)) || null;
}

/**
 * Reply under the original report when its task changes column.
 * Tasks the bot didn't file are ignored, so other orgs' tasks never post.
 * @param {Client} client - Discord client
 * @param {Object} task - New tasks row
 * @param {Object|null} previous - Old tasks row
 * @returns {Promise<boolean>} whether a reply was posted
 */
async function postReportStatus(client, task, previous) {
  const post = getReportPost(task.id);
  if (!post || !getGuildConfig(post.guildId)) return false;
  if (!(await ensureLiveConnection(post.guildId))) return false;

  const change = describeStatusChange(post.type, previous?.column_id ?? null, task.column_id);
  if (!change) return false;

  const label = post.type === 'bug' ? 'bug report' : 'feature request';
  const content = `${change.emoji} <@${post.reporterId}> your ${label} **${post.title}** ${change.text}.`;
  const allowedMentions = { users: [post.reporterId] };

  try {
    const guild = await client.guilds.fetch(post.guildId);
    const channel = await guild.channels.fetch(post.channelId);
    try {
      const message = await channel.messages.fetch(post.messageId);
      await message.reply({ content, allowedMentions });
    } catch {
      // Original post was deleted: post in the same channel instead
      await channel.send({ content, allowedMentions });
    }

    store.map.set(String(task.id), { ...post, updatedAt: new Date().toISOString() });
    store.save();
    logger.info(`Posted status "${task.column_id}" for task ${task.id} in guild ${post.guildId}`);
    return true;
  } catch (error) {
    logger.error(`Failed to post status for task ${task.id}:`, error);
    return false;
  }
}

module.exports = {
  trackReportPost,
  getReportPost,
  postReportStatus
};
