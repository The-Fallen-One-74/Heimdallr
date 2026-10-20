const { useFakeSupabase, linkGuild, createFakeDiscord } = require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const { getDailySettings, getLocalNow, sendDailyPost } = require('../src/services/dailyDigest');
const { getGuildConfig } = require('../src/services/configManager');

test('daily settings fill in defaults', () => {
  assert.deepEqual(getDailySettings({}), { enabled: true, hour: 9, out_today: false, milestones: true });
  assert.deepEqual(getDailySettings({ daily: { hour: 7, out_today: true } }), { enabled: true, hour: 7, out_today: true, milestones: true });
});

test('local date and hour follow the server timezone', () => {
  const instant = new Date('2026-11-02T03:30:00Z');
  assert.deepEqual(getLocalNow('America/New_York', instant), { date: '2026-11-01', hour: 22 });
  assert.deepEqual(getLocalNow('Asia/Tokyo', instant), { date: '2026-11-02', hour: 12 });
  assert.deepEqual(getLocalNow('UTC', instant), { date: '2026-11-02', hour: 3 });
});

function fakeBifrost() {
  return useFakeSupabase({
    tables: {
      time_off_requests: () => ({ data: [{ user_id: 'a' }, { user_id: 'b' }, { user_id: 'a' }], error: null }),
      users: () => ({ data: [{ first_name: 'Zoe', last_name: 'Q' }, { first_name: 'Ann', last_name: 'B' }], error: null }),
      projects: () => ({ data: [{ id: 1, name: 'Bifrost' }], error: null }),
      milestones: () => ({ data: [{ id: 5, title: 'Alpha', due_date: '2026-11-02', department_id: 3, project_id: 1 }], error: null })
    }
  });
}

test('the daily post lists names only, and milestones with their department role', async () => {
  linkGuild('g1', { department_roles: { 3: 'role-design' }, daily: { out_today: true } });
  const discord = createFakeDiscord('g1');
  fakeBifrost();

  assert.equal(await sendDailyPost(discord, 'g1', getGuildConfig('g1'), '2026-11-02'), true);
  const post = discord.channel.sent[0];
  assert.equal(post.content, '<@&role-design>');
  assert.equal(post.embeds[0].data.title, '🌴 Out Today');
  assert.equal(post.embeds[0].data.description, 'Ann B\nZoe Q');
  assert.match(post.embeds[1].data.description, /Alpha.*due today.*<@&role-design>/);
});

test('out today stays off unless turned on', async () => {
  linkGuild('g2');
  const discord = createFakeDiscord('g2');
  const fake = fakeBifrost();

  await sendDailyPost(discord, 'g2', getGuildConfig('g2'), '2026-11-02');
  assert.equal(discord.channel.sent[0].embeds.length, 1);
  assert.equal(discord.channel.sent[0].embeds[0].data.title, '🎯 Milestones Coming Up');
  assert.equal(fake.calls.some(c => c.table === 'time_off_requests'), false);
});

test('nothing to say means no post', async () => {
  linkGuild('g3');
  const discord = createFakeDiscord('g3');
  useFakeSupabase({ tables: { projects: () => ({ data: [], error: null }) } });
  assert.equal(await sendDailyPost(discord, 'g3', getGuildConfig('g3'), '2026-11-02'), false);
  assert.equal(discord.channel.sent.length, 0);
});
