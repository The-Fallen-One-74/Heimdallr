const { useFakeSupabase, linkGuild, createFakeDiscord } = require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const { getGuildConfig } = require('../src/services/configManager');
const { ensureLiveConnection } = require('../src/services/connectionStatus');
const { sendNotification } = require('../src/services/notificationService');
const { initScheduler, stopScheduler, checkUpcomingEvents } = require('../src/services/reminderScheduler');

const revoked = () => ({ data: { revoked_at: '2026-10-20T00:00:00Z' }, error: null });

test('a server disconnected in Bifröst is unlinked and gets no posts', async () => {
  linkGuild('cs-1', { timezone: 'Europe/London' });
  const discord = createFakeDiscord('cs-1');
  useFakeSupabase({ tables: { discord_connections: revoked } });

  assert.equal(await sendNotification(discord, 'cs-1', { content: 'hello' }), null);
  assert.equal(discord.channel.sent.length, 0);
  assert.equal(getGuildConfig('cs-1'), null, 'no longer counts as set up');
});

test('a deleted connection counts as disconnected', async () => {
  linkGuild('cs-2');
  useFakeSupabase({ tables: { discord_connections: () => ({ data: null, error: null }) } });
  assert.equal(await ensureLiveConnection('cs-2'), false);
  assert.equal(getGuildConfig('cs-2'), null);
});

test('posting keeps working before Bifröst has the connections table, or when it is unreachable', async () => {
  linkGuild('cs-3');
  const discord = createFakeDiscord('cs-3');
  useFakeSupabase({ tables: { discord_connections: () => ({ data: null, error: { code: 'PGRST205', message: 'missing' } }) } });
  assert.ok(await sendNotification(discord, 'cs-3', { content: 'hello' }));

  useFakeSupabase({ tables: { discord_connections: () => ({ data: null, error: { code: 'ECONNRESET', message: 'down' } }) } });
  assert.ok(await sendNotification(discord, 'cs-3', { content: 'again' }));
  assert.equal(discord.channel.sent.length, 2);
  assert.ok(getGuildConfig('cs-3'));
});

test('a live answer is reused for a few minutes', async () => {
  linkGuild('cs-4');
  const fake = useFakeSupabase();
  await ensureLiveConnection('cs-4');
  await ensureLiveConnection('cs-4');
  assert.equal(fake.calls.filter(c => c.table === 'discord_connections').length, 1);
});

test('reminders skip a disconnected server without reading its events', async (t) => {
  linkGuild('cs-5');
  const discord = createFakeDiscord('cs-5');
  const fake = useFakeSupabase({ tables: { discord_connections: revoked } });

  initScheduler(discord);
  t.after(stopScheduler);
  await checkUpcomingEvents();

  assert.equal(fake.calls.some(c => c.table === 'calendar_events'), false);
  assert.equal(discord.channel.sent.length, 0);
});
