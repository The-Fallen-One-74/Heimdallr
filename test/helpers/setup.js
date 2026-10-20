// Loaded first by every test file. Points the bot's local state at a fresh
// temp folder and swaps the Supabase client for a fake, so tests never touch
// config/ or a real database.
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.HEIMDALLR_STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'heimdallr-test-'));
process.on('exit', () => fs.rmSync(process.env.HEIMDALLR_STATE_DIR, { recursive: true, force: true }));
const SRC = path.join(__dirname, '../../src');

// Keep test output clean, and keep expected errors out of logs/error.log
require(path.join(SRC, 'utils/logger')).silent = true;

// Every linked test server counts as still connected in Bifröst unless a
// test says otherwise
const DEFAULT_TABLES = {
  discord_connections: () => ({ data: { revoked_at: null }, error: null })
};

/**
 * A fake Supabase client.
 * - tables: { [table]: (query) => ({ data, error }) }, query = { table, ops: [[method, args]] }
 * - rpc: (name, args) => ({ data, error })
 * Every call is recorded in `calls`.
 */
function createFakeSupabase({ tables = {}, rpc = () => ({ data: null, error: null }) } = {}) {
  const calls = [];
  const fake = {
    calls,
    tables,
    rpcHandler: rpc,
    rpc: async (name, args) => {
      calls.push({ kind: 'rpc', name, args });
      return fake.rpcHandler(name, args);
    },
    from: table => {
      calls.push({ kind: 'from', table });
      const query = { table, ops: [] };
      const respond = () => {
        const handler = fake.tables[table] || DEFAULT_TABLES[table];
        return Promise.resolve(handler ? handler(query) : { data: null, error: null });
      };
      const chain = new Proxy({}, {
        get(_, method) {
          if (method === 'then') return (resolve, reject) => respond().then(resolve, reject);
          return (...args) => {
            query.ops.push([method, args]);
            if (['insert', 'update', 'delete', 'upsert'].includes(method)) calls.push({ kind: method, table, args });
            if (method === 'single' || method === 'maybeSingle') return respond();
            return chain;
          };
        }
      });
      return chain;
    }
  };
  return fake;
}

let current = createFakeSupabase();

// Replace the real client module before anything requires it
require.cache[require.resolve(path.join(SRC, 'services/bifrostClient'))] = {
  exports: {
    initBifrostClient: () => current,
    getBifrostClient: () => current,
    testBifrostConnection: async () => true
  }
};

/**
 * Use a new fake client for the following calls
 */
function useFakeSupabase(options) {
  require(path.join(SRC, 'services/connectionStatus')).clearConnectionCache();
  current = createFakeSupabase(options);
  return current;
}

/**
 * Save a linked server config for tests
 */
function linkGuild(guildId, extra = {}) {
  const { saveGuildConfig } = require(path.join(SRC, 'services/configManager'));
  return saveGuildConfig(guildId, {
    organization_id: 1,
    organization_name: 'Kyrie',
    connection_id: `conn-${guildId}`,
    notification_channel_id: 'channel-1',
    timezone: 'America/New_York',
    ...extra
  });
}

/**
 * A fake Discord channel that records what is sent to it
 */
function createFakeChannel(id = 'channel-1') {
  const sent = [];
  const replies = [];
  const channel = {
    id,
    sent,
    replies,
    send: async payload => {
      const message = { id: `msg-${sent.length + 1}`, channelId: id, payload, reply: async p => replies.push(p) };
      sent.push(payload);
      return message;
    },
    messages: {
      fetch: async messageId => ({ id: messageId, reply: async p => replies.push({ messageId, ...p }) })
    }
  };
  return channel;
}

/**
 * A fake Discord client with one guild and one channel
 */
function createFakeDiscord(guildId, channel = createFakeChannel()) {
  const guild = {
    id: guildId,
    name: 'Test Guild',
    members: { me: { permissions: { has: () => false } } },
    channels: { fetch: async () => channel },
    scheduledEvents: { fetchSubscribers: async () => new Map() }
  };
  return {
    guild,
    channel,
    guilds: {
      cache: new Map([[guildId, guild]]),
      fetch: async () => guild
    }
  };
}

module.exports = {
  SRC,
  useFakeSupabase,
  linkGuild,
  createFakeChannel,
  createFakeDiscord
};
