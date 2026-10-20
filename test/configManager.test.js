const { linkGuild } = require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const { saveGuildConfig, getGuildConfig, isGuildConfigured, getGuildsByOrganization } = require('../src/services/configManager');

test('a server counts as set up only after redeeming a link code', () => {
  saveGuildConfig('legacy', { organization_id: 1, notification_channel_id: 'c' });
  assert.equal(isGuildConfigured('legacy'), false);
  assert.equal(getGuildConfig('legacy'), null);

  linkGuild('linked');
  assert.equal(isGuildConfigured('linked'), true);
  assert.equal(getGuildConfig('linked').connection_id, 'conn-linked');
});

test('organization lookups skip servers without a link', () => {
  saveGuildConfig('legacy-2', { organization_id: 5 });
  linkGuild('linked-2', { organization_id: 5 });
  assert.deepEqual(getGuildsByOrganization(5), ['linked-2']);
});

test('saving merges into the existing config', () => {
  linkGuild('merge', { timezone: 'UTC' });
  saveGuildConfig('merge', { notification_channel_id: 'new' });
  const config = getGuildConfig('merge');
  assert.equal(config.timezone, 'UTC');
  assert.equal(config.notification_channel_id, 'new');
});
