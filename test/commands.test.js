const { useFakeSupabase, linkGuild, createFakeChannel } = require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { getGuildConfig, saveGuildConfig } = require('../src/services/configManager');
const { getReportPost } = require('../src/services/reportPosts');
const { setSignup } = require('../src/services/signups');

function loadCommands(dir) {
  return fs.readdirSync(dir).flatMap(file => {
    const full = path.join(dir, file);
    return fs.statSync(full).isDirectory() ? loadCommands(full) : file.endsWith('.js') ? [require(full)] : [];
  });
}

const commands = Object.fromEntries(loadCommands(path.join(__dirname, '../src/commands')).map(c => [c.data.name, c]));

// A fake slash command interaction. Records every reply.
function fakeInteraction(guildId, options = {}) {
  const channel = createFakeChannel();
  const replies = [];
  return {
    replies,
    channel,
    guildId,
    guild: { id: guildId, name: 'Test Guild', channels: { fetch: async () => channel } },
    user: { id: 'u1', tag: 'brian' },
    options: {
      getString: k => options[k] ?? null,
      getInteger: k => options[k] ?? null,
      getBoolean: k => options[k] ?? null,
      getChannel: k => options[k] ?? null
    },
    deferReply: async () => {},
    reply: async payload => { replies.push(payload); },
    editReply: async payload => { replies.push(payload); return { id: `reply-${replies.length}`, channelId: 'cmd-channel' }; },
    lastEmbed() { return replies.at(-1).embeds[0].data; }
  };
}

test('every command definition is valid for Discord', () => {
  assert.ok(Object.keys(commands).length >= 16);
  for (const command of Object.values(commands)) command.data.toJSON();
});

test('/setup takes a code and no organization ID', () => {
  const names = commands.setup.data.toJSON().options.map(o => o.name);
  assert.deepEqual(names, ['notification_channel', 'code', 'timezone', 'discord_events']);
});

test('/setup links a server with a code', async () => {
  const fake = useFakeSupabase({
    rpc: () => ({ data: { ok: true, connection_id: 'conn-9', organization_id: 9, organization_name: 'Kyrie' }, error: null })
  });
  const i = fakeInteraction('setup-1', { notification_channel: { id: 'c1' }, code: 'BFR-7K2Q-M9XD', timezone: 'Europe/London' });
  await commands.setup.execute(i);

  assert.equal(i.lastEmbed().title, '✅ Setup Complete!');
  assert.equal(fake.calls[0].name, 'redeem_discord_link_code');
  const config = getGuildConfig('setup-1');
  assert.equal(config.connection_id, 'conn-9');
  assert.equal(config.timezone, 'Europe/London');
  assert.deepEqual(config.reminder_times.meeting, [1440, 60, 15]);
});

test('/setup without a code only updates a linked server', async () => {
  linkGuild('setup-2', { reminder_times: { meeting: [30] } });
  const i = fakeInteraction('setup-2', { notification_channel: { id: 'c2' } });
  await commands.setup.execute(i);
  const config = getGuildConfig('setup-2');
  assert.equal(config.notification_channel_id, 'c2');
  assert.equal(config.connection_id, 'conn-setup-2');
  assert.deepEqual(config.reminder_times.meeting, [30]);

  saveGuildConfig('setup-3', { organization_id: 1 });
  const legacy = fakeInteraction('setup-3', { notification_channel: { id: 'c3' } });
  await commands.setup.execute(legacy);
  assert.match(legacy.lastEmbed().description, /Org Settings → Discord/);
});

test('/setup explains when Bifröst has no link codes yet', async () => {
  useFakeSupabase({ rpc: () => ({ data: null, error: { code: 'PGRST202' } }) });
  const i = fakeInteraction('setup-4', { notification_channel: { id: 'c4' }, code: '7K2QM9XD' });
  await commands.setup.execute(i);
  assert.match(i.lastEmbed().description, /aren't turned on in Bifröst yet/);
  assert.equal(getGuildConfig('setup-4'), null);
});

test('/bug and /feature go through Bifröst and remember the post', async () => {
  linkGuild('rep-1');
  const fake = useFakeSupabase({ rpc: () => ({ data: { task_id: 501 }, error: null }) });

  const bug = fakeInteraction('rep-1', { title: 'Crash', steps: '1. open', severity: 'blocker' });
  await commands.bug.execute(bug);
  assert.deepEqual(fake.calls.at(-1).args, {
    p_connection_id: 'conn-rep-1', p_type: 'bug', p_title: 'Crash', p_description: null,
    p_priority: 'critical', p_severity: 'blocker', p_steps: '1. open', p_reporter_tag: 'brian'
  });
  assert.equal(getReportPost(501).type, 'bug');
  assert.equal(getReportPost(501).reporterId, 'u1');
  assert.equal(bug.channel.sent.length, 1, 'copy posted to the notification channel');

  fake.rpcHandler = () => ({ data: { task_id: 502 }, error: null });
  const feature = fakeInteraction('rep-1', { title: 'Dark mode', description: 'Please' });
  await commands.feature.execute(feature);
  assert.equal(fake.calls.at(-1).args.p_type, 'feature');
  assert.equal(fake.calls.at(-1).args.p_priority, 'medium');
  assert.equal(getReportPost(502).title, 'Dark mode');

  assert.equal(fake.calls.some(c => c.kind === 'insert'), false, 'no direct task inserts');
});

test('report errors from Bifröst are shown to the reporter', async () => {
  linkGuild('rep-2');
  useFakeSupabase({ rpc: () => ({ data: null, error: { code: '42501', message: 'Discord connection not found or revoked' } }) });
  const i = fakeInteraction('rep-2', { title: 'X', steps: 'y' });
  await commands.bug.execute(i);
  assert.match(i.lastEmbed().description, /revoked/);
});

test('/reports saves the board in Bifröst', async () => {
  linkGuild('rep-3');
  const fake = useFakeSupabase({ tables: { projects: () => ({ data: [{ id: 3, name: 'Game' }], error: null }) } });
  const i = fakeInteraction('rep-3', { project: '3' });
  await commands.reports.execute(i);
  assert.deepEqual(fake.calls.find(c => c.kind === 'rpc').args, { p_connection_id: 'conn-rep-3', p_project_id: 3 });
  assert.equal(getGuildConfig('rep-3').report_project_name, 'Game');
});

test('/attendees lists sign-ups by answer', async () => {
  linkGuild('att-1');
  useFakeSupabase({ tables: { calendar_events: () => ({ data: [{ id: 12, title: 'Design sync', event_date: '2026-11-02', event_time: '17:00' }], error: null }) } });
  setSignup('att-1', 12, 'a', 'going');
  setSignup('att-1', 12, 'b', 'maybe');
  const i = fakeInteraction('att-1', { event_id: 12 });
  await commands.attendees.execute(i);
  const embed = i.lastEmbed();
  assert.equal(embed.title, '📊 Sign-ups: Design sync');
  assert.deepEqual(embed.fields.map(f => f.name), ['✅ Joining (1)', '❓ Maybe (1)']);
});
