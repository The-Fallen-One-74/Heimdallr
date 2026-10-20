const { getBifrostClient } = require('./bifrostClient');
const logger = require('../utils/logger');

/**
 * Whether a Supabase error means the RPC isn't in the database yet.
 * PGRST202 comes from PostgREST, 42883 from Postgres itself.
 */
function isMissingFunction(error) {
  return error?.code === 'PGRST202' || error?.code === '42883';
}

/**
 * Turn what an admin typed ("bfr-7k2q-m9xd", "7K2Q M9XD") into the
 * 8-character code. Bifröst normalizes again, this just catches typos early.
 * @param {string} input
 * @returns {string|null}
 */
function normalizeLinkCode(input) {
  let code = String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length === 11 && code.startsWith('BFR')) code = code.slice(3);
  return code.length === 8 ? code : null;
}

/**
 * Redeem a one-time link code from Bifröst Org Settings → Discord
 * @param {Object} params
 * @param {string} params.code - Code as typed
 * @param {Guild} params.guild - Discord guild being linked
 * @param {string} params.discordUserId - Admin running /setup
 * @param {string} params.notificationChannelId
 * @param {string} params.timezone
 * @returns {Promise<{ ok: true, connection_id: string, organization_id: number, organization_name: string }
 *   | { ok: false, error: 'invalid_code'|'rate_limited'|'not_available'|'failed' }>}
 */
async function redeemLinkCode({ code, guild, discordUserId, notificationChannelId, timezone }) {
  const normalized = normalizeLinkCode(code);
  if (!normalized) return { ok: false, error: 'invalid_code' };

  const client = getBifrostClient();
  if (!client) return { ok: false, error: 'failed' };

  const { data, error } = await client.rpc('redeem_discord_link_code', {
    p_code: normalized,
    p_guild_id: guild.id,
    p_guild_name: guild.name,
    p_discord_user_id: discordUserId,
    p_notification_channel_id: notificationChannelId,
    p_timezone: timezone
  });

  if (error) {
    if (isMissingFunction(error)) return { ok: false, error: 'not_available' };
    logger.error(`Failed to redeem link code for guild ${guild.id}:`, error);
    return { ok: false, error: 'failed' };
  }

  if (!data?.ok) return { ok: false, error: data?.error || 'invalid_code' };

  return {
    ok: true,
    connection_id: data.connection_id,
    organization_id: data.organization_id,
    organization_name: data.organization_name
  };
}

module.exports = {
  isMissingFunction,
  normalizeLinkCode,
  redeemLinkCode
};
