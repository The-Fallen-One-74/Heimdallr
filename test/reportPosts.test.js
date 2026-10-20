const { linkGuild, createFakeDiscord } = require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const { describeStatusChange } = require('../src/utils/reportStatus');
const { trackReportPost, postReportStatus } = require('../src/services/reportPosts');

test('only meaningful column moves are described', () => {
  assert.equal(describeStatusChange('bug', 'product-backlog', 'done').text, 'was fixed');
  assert.equal(describeStatusChange('feature', 'submitted', 'approved').text, 'was approved');
  assert.equal(describeStatusChange('feature', 'approved', 'declined').text, 'was declined');
  assert.equal(describeStatusChange('feature', 'in-progress', 'done').text, 'has shipped');
  assert.equal(describeStatusChange('feature', 'approved', 'approved'), null);
  assert.equal(describeStatusChange('feature', 'under-review', 'submitted'), null);
  assert.equal(describeStatusChange('bug', 'sprint-backlog', 'product-backlog'), null);
  assert.equal(describeStatusChange('task', 'todo', 'done'), null);
});

test('a status change replies under the report and tags only the reporter', async () => {
  linkGuild('g1');
  const discord = createFakeDiscord('g1');
  trackReportPost({ taskId: 42, guildId: 'g1', channelId: 'channel-1', messageId: 'm42', type: 'feature', title: 'Dark mode', reporterId: 'u1' });

  assert.equal(await postReportStatus(discord, { id: 42, column_id: 'approved' }, { id: 42, column_id: 'submitted' }), true);
  assert.deepEqual(discord.channel.replies, [{
    messageId: 'm42',
    content: '👍 <@u1> your feature request **Dark mode** was approved.',
    allowedMentions: { users: ['u1'] }
  }]);
});

test('tasks the bot did not file, and quiet moves, post nothing', async () => {
  linkGuild('g1');
  const discord = createFakeDiscord('g1');
  trackReportPost({ taskId: 43, guildId: 'g1', channelId: 'channel-1', messageId: 'm43', type: 'bug', title: 'Crash', reporterId: 'u2' });

  assert.equal(await postReportStatus(discord, { id: 999, column_id: 'done' }, { column_id: 'product-backlog' }), false);
  assert.equal(await postReportStatus(discord, { id: 43, column_id: 'product-backlog' }, null), false);
  assert.equal(discord.channel.replies.length, 0);
});

test('reports from a server that is no longer linked post nothing', async () => {
  const discord = createFakeDiscord('gone');
  trackReportPost({ taskId: 44, guildId: 'gone', channelId: 'channel-1', messageId: 'm44', type: 'bug', title: 'X', reporterId: 'u3' });
  assert.equal(await postReportStatus(discord, { id: 44, column_id: 'done' }, { column_id: 'product-backlog' }), false);
});

test('if the original post is gone, the reply goes to the channel', async () => {
  linkGuild('g1');
  const discord = createFakeDiscord('g1');
  discord.channel.messages.fetch = async () => { throw new Error('Unknown Message'); };
  trackReportPost({ taskId: 45, guildId: 'g1', channelId: 'channel-1', messageId: 'deleted', type: 'bug', title: 'Lag', reporterId: 'u4' });

  assert.equal(await postReportStatus(discord, { id: 45, column_id: 'done' }, { column_id: 'sprint-backlog' }), true);
  assert.equal(discord.channel.sent[0].content, '✅ <@u4> your bug report **Lag** was fixed.');
});
