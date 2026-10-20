const { useFakeSupabase } = require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeLinkCode, redeemLinkCode, isMissingFunction } = require('../src/services/discordLink');

const guild = { id: '123456789012345678', name: 'Kyrie Discord' };

test('normalizeLinkCode accepts the code however it is typed', () => {
  assert.equal(normalizeLinkCode('BFR-7K2Q-M9XD'), '7K2QM9XD');
  assert.equal(normalizeLinkCode('bfr 7k2q m9xd'), '7K2QM9XD');
  assert.equal(normalizeLinkCode('7K2QM9XD'), '7K2QM9XD');
  assert.equal(normalizeLinkCode('7K2Q'), null);
  assert.equal(normalizeLinkCode(''), null);
  assert.equal(normalizeLinkCode(null), null);
});

test('isMissingFunction recognizes PostgREST and Postgres errors', () => {
  assert.equal(isMissingFunction({ code: 'PGRST202' }), true);
  assert.equal(isMissingFunction({ code: '42883' }), true);
  assert.equal(isMissingFunction({ code: '42501' }), false);
  assert.equal(isMissingFunction(null), false);
});

test('a malformed code never reaches Bifröst', async () => {
  const fake = useFakeSupabase();
  const result = await redeemLinkCode({ code: 'nope', guild, discordUserId: '1' });
  assert.deepEqual(result, { ok: false, error: 'invalid_code' });
  assert.equal(fake.calls.length, 0);
});

test('a valid code is redeemed with the server and channel', async () => {
  const fake = useFakeSupabase({
    rpc: () => ({ data: { ok: true, connection_id: 'conn-1', organization_id: 7, organization_name: 'Kyrie' }, error: null })
  });
  const result = await redeemLinkCode({
    code: 'bfr-7k2q-m9xd', guild, discordUserId: '555', notificationChannelId: '777', timezone: 'Europe/London'
  });
  assert.deepEqual(result, { ok: true, connection_id: 'conn-1', organization_id: 7, organization_name: 'Kyrie' });
  assert.deepEqual(fake.calls[0], {
    kind: 'rpc',
    name: 'redeem_discord_link_code',
    args: {
      p_code: '7K2QM9XD',
      p_guild_id: guild.id,
      p_guild_name: guild.name,
      p_discord_user_id: '555',
      p_notification_channel_id: '777',
      p_timezone: 'Europe/London'
    }
  });
});

test('Bifröst refusals and outages come back as error codes', async () => {
  useFakeSupabase({ rpc: () => ({ data: { ok: false, error: 'rate_limited' }, error: null }) });
  assert.deepEqual(await redeemLinkCode({ code: '7K2QM9XD', guild, discordUserId: '1' }), { ok: false, error: 'rate_limited' });

  useFakeSupabase({ rpc: () => ({ data: null, error: { code: 'PGRST202', message: 'not found' } }) });
  assert.deepEqual(await redeemLinkCode({ code: '7K2QM9XD', guild, discordUserId: '1' }), { ok: false, error: 'not_available' });

  useFakeSupabase({ rpc: () => ({ data: null, error: { code: '08006', message: 'connection failure' } }) });
  assert.deepEqual(await redeemLinkCode({ code: '7K2QM9XD', guild, discordUserId: '1' }), { ok: false, error: 'failed' });
});
