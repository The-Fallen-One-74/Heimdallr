const { useFakeSupabase, linkGuild, createFakeDiscord } = require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const { initScheduler, stopScheduler, checkUpcomingEvents, getReminderTimes, formatReminderTime } = require('../src/services/reminderScheduler');
const { setSignup } = require('../src/services/signups');

test('reminder times come from the server config, then the defaults', () => {
  assert.deepEqual(getReminderTimes({}, 'meeting'), [1440, 60, 15]);
  assert.deepEqual(getReminderTimes({}, 'holiday'), [1440]);
  assert.deepEqual(getReminderTimes({}, 'unknown'), [60]);
  assert.deepEqual(getReminderTimes({ reminder_times: { meeting: [30] } }, 'meeting'), [30]);
});

test('reminder wording', () => {
  assert.equal(formatReminderTime(0), 'now');
  assert.equal(formatReminderTime(1), 'in 1 minute');
  assert.equal(formatReminderTime(15), 'in 15 minutes');
  assert.equal(formatReminderTime(60), 'in 1 hour');
  assert.equal(formatReminderTime(1440), 'in 1 day');
});

// An event N minutes from now, in the UTC date/time Bifröst stores
function eventIn(minutes, extra = {}) {
  const at = new Date(Date.now() + minutes * 60 * 1000 + 30 * 1000);
  const iso = at.toISOString();
  return { id: 77, organization_id: 1, title: 'Design sync', type: 'meeting', event_date: iso.substring(0, 10), event_time: iso.substring(11, 16), department_id: 3, ...extra };
}

test('a reminder tags the department role and everyone who chose Join or Maybe, once', async (t) => {
  linkGuild('g1', { department_roles: { 3: 'role-design' } });
  const discord = createFakeDiscord('g1');
  useFakeSupabase({ tables: { calendar_events: () => ({ data: [eventIn(60)], error: null }) } });
  setSignup('g1', 77, 'u-going', 'going');
  setSignup('g1', 77, 'u-maybe', 'maybe');
  setSignup('g1', 77, 'u-no', 'not_going');

  initScheduler(discord);
  t.after(stopScheduler);

  await checkUpcomingEvents();
  assert.equal(discord.channel.sent.length, 1);
  const post = discord.channel.sent[0];
  assert.equal(post.content, '<@&role-design> <@u-going> <@u-maybe>');
  assert.match(post.embeds[0].data.title, /Reminder: Design sync/);
  assert.deepEqual(post.components[0].toJSON().components.map(c => c.label), ['Join (1)', 'Maybe (1)', 'Can\'t (1)']);

  // The same reminder is not sent twice
  await checkUpcomingEvents();
  assert.equal(discord.channel.sent.length, 1);
});

test('holiday reminders have no buttons and events outside a reminder window are skipped', async (t) => {
  linkGuild('g2');
  const discord = createFakeDiscord('g2');
  useFakeSupabase({ tables: { calendar_events: () => ({ data: [eventIn(1440, { id: 78, type: 'holiday', title: 'Day off' }), eventIn(200, { id: 79 })], error: null }) } });

  initScheduler(discord);
  t.after(stopScheduler);

  await checkUpcomingEvents();
  assert.equal(discord.channel.sent.length, 1);
  assert.match(discord.channel.sent[0].embeds[0].data.title, /Day off/);
  assert.deepEqual(discord.channel.sent[0].components, []);
});

test('a rescheduled event gets its reminder again for the new time', async (t) => {
  linkGuild('g3');
  const discord = createFakeDiscord('g3');
  let event = eventIn(60, { id: 80 });
  useFakeSupabase({ tables: { calendar_events: () => ({ data: [event], error: null }) } });

  initScheduler(discord);
  t.after(stopScheduler);

  await checkUpcomingEvents();
  assert.equal(discord.channel.sent.length, 1);

  // Same event, still an hour out but at a new time: the reminder goes out again
  event = eventIn(56, { id: 80 });
  await checkUpcomingEvents();
  assert.equal(discord.channel.sent.length, 2);

  // And only once for that time
  await checkUpcomingEvents();
  assert.equal(discord.channel.sent.length, 2);
});
