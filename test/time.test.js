require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseTime12h, localToUtc } = require('../src/utils/time');

test('parseTime12h reads 12-hour times', () => {
  assert.equal(parseTime12h('9:00 AM'), '09:00');
  assert.equal(parseTime12h('2:30pm'), '14:30');
  assert.equal(parseTime12h('12:00 AM'), '00:00');
  assert.equal(parseTime12h('12:15 PM'), '12:15');
  assert.equal(parseTime12h(' 11:59 pm '), '23:59');
});

test('parseTime12h rejects anything else', () => {
  for (const bad of ['13:00 PM', '9 AM', '09:60 AM', '14:30', '', 'noon']) {
    assert.equal(parseTime12h(bad), null, bad);
  }
});

test('localToUtc converts to the UTC pair Bifröst stores', () => {
  assert.deepEqual(localToUtc('2026-07-15', '09:00', 'America/New_York'), { event_date: '2026-07-15', event_time: '13:00' });
  assert.deepEqual(localToUtc('2026-01-15', '09:00', 'America/New_York'), { event_date: '2026-01-15', event_time: '14:00' });
  assert.deepEqual(localToUtc('2026-01-15', '20:00', 'America/Los_Angeles'), { event_date: '2026-01-16', event_time: '04:00' });
  assert.deepEqual(localToUtc('2026-01-15', '08:00', 'Asia/Tokyo'), { event_date: '2026-01-14', event_time: '23:00' });
  assert.deepEqual(localToUtc('2026-01-15', '08:00', 'UTC'), { event_date: '2026-01-15', event_time: '08:00' });
});

test('localToUtc uses the offset in effect on each side of a DST switch', () => {
  // New York springs forward 2026-03-08 and falls back 2026-11-01
  assert.deepEqual(localToUtc('2026-03-07', '12:00', 'America/New_York'), { event_date: '2026-03-07', event_time: '17:00' });
  assert.deepEqual(localToUtc('2026-03-08', '12:00', 'America/New_York'), { event_date: '2026-03-08', event_time: '16:00' });
  assert.deepEqual(localToUtc('2026-10-31', '12:00', 'America/New_York'), { event_date: '2026-10-31', event_time: '16:00' });
  assert.deepEqual(localToUtc('2026-11-01', '12:00', 'America/New_York'), { event_date: '2026-11-01', event_time: '17:00' });
  // London switches on different dates
  assert.deepEqual(localToUtc('2026-03-29', '12:00', 'Europe/London'), { event_date: '2026-03-29', event_time: '11:00' });
});
