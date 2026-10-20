const { linkGuild } = require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { setSignup, getSignups, getAttendeeIds } = require('../src/services/signups');
const { wantsSignups, buildSignupRow, parseSignupCustomId } = require('../src/utils/signupButtons');
const signupButton = require('../src/interactions/signupButton');
const interactionCreate = require('../src/events/interactionCreate');

test('each member has one answer per event, and the latest wins', () => {
  setSignup('g1', 10, 'u1', 'going');
  setSignup('g1', 10, 'u2', 'maybe');
  setSignup('g1', 10, 'u2', 'not_going');
  setSignup('g1', 10, 'u3', 'maybe');
  assert.deepEqual(getSignups('g1', 10), { going: ['u1'], maybe: ['u3'], not_going: ['u2'] });
  assert.deepEqual(getAttendeeIds('g1', 10), ['u1', 'u3']);
});

test('answers are separate per server and per event', () => {
  setSignup('g2', 10, 'u1', 'not_going');
  setSignup('g1', 11, 'u1', 'maybe');
  assert.deepEqual(getSignups('g2', 10).not_going, ['u1']);
  assert.deepEqual(getSignups('g1', 11).maybe, ['u1']);
  assert.deepEqual(getSignups('g1', 10).going, ['u1']);
  assert.deepEqual(getSignups('g1', 999), { going: [], maybe: [], not_going: [] });
});

test('invalid statuses are refused', () => {
  assert.equal(setSignup('g1', 10, 'u9', 'yes'), false);
  assert.equal(getAttendeeIds('g1', 10).includes('u9'), false);
});

test('answers are saved to the state folder', () => {
  const file = path.join(process.env.HEIMDALLR_STATE_DIR, 'signups.json');
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(saved['g1:10'].users.u1, 'going');
});

test('button IDs round-trip and counts show on labels', () => {
  const row = buildSignupRow(42, { going: ['a', 'b'], maybe: [], not_going: ['c'] }).toJSON();
  assert.deepEqual(row.components.map(c => c.label), ['Join (2)', 'Maybe', 'Can\'t (1)']);
  assert.deepEqual(row.components.map(c => parseSignupCustomId(c.custom_id)), [
    { eventId: 42, status: 'going' },
    { eventId: 42, status: 'maybe' },
    { eventId: 42, status: 'not_going' }
  ]);
  assert.equal(parseSignupCustomId('signup:abc:going'), null);
  assert.equal(parseSignupCustomId('signup:1:yes'), null);
  assert.equal(parseSignupCustomId('other:1:going'), null);
});

test('holidays get no buttons', () => {
  assert.equal(wantsSignups({ type: 'holiday' }), false);
  for (const type of ['meeting', 'company', 'retrospective', 'other']) assert.equal(wantsSignups({ type }), true);
});

function fakeButton(customId, guildId, userId) {
  const out = [];
  return {
    out,
    customId,
    guildId,
    user: { id: userId },
    message: { id: 'm1' },
    replied: false,
    deferred: false,
    isAutocomplete: () => false,
    isButton: () => true,
    update: async payload => { out.push({ update: payload.components[0].toJSON().components.map(c => c.label) }); },
    followUp: async payload => out.push({ followUp: payload.content, ephemeral: payload.ephemeral }),
    reply: async payload => out.push({ reply: payload.content, ephemeral: payload.ephemeral })
  };
}

test('clicking a button saves the answer, refreshes counts and confirms privately', async () => {
  linkGuild('g3');
  const click = fakeButton('signup:7:going', 'g3', 'u1');
  await interactionCreate.execute(click);
  assert.deepEqual(click.out[0], { update: ['Join (1)', 'Maybe', 'Can\'t'] });
  assert.equal(click.out[1].ephemeral, true);
  assert.match(click.out[1].followUp, /You're in/);
  assert.deepEqual(getAttendeeIds('g3', 7), ['u1']);
});

test('clicks on an unlinked server are refused without saving', async () => {
  const click = fakeButton('signup:7:going', 'not-linked', 'u1');
  await signupButton.handle(click);
  assert.equal(click.out[0].ephemeral, true);
  assert.deepEqual(getAttendeeIds('not-linked', 7), []);
});

test('other buttons are ignored', async () => {
  const click = fakeButton('something-else', 'g3', 'u1');
  await interactionCreate.execute(click);
  assert.deepEqual(click.out, []);
});
