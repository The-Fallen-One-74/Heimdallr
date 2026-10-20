const { isGuildConfigured } = require('../services/configManager');
const { setSignup, getSignups } = require('../services/signups');
const { buildSignupRow, parseSignupCustomId, signupConfirmation } = require('../utils/signupButtons');
const logger = require('../utils/logger');

/**
 * Whether this handler owns a button interaction
 */
function matches(interaction) {
  return parseSignupCustomId(interaction.customId) !== null;
}

/**
 * Save the member's answer and refresh the counts on the clicked post
 */
async function handle(interaction) {
  const { eventId, status } = parseSignupCustomId(interaction.customId);

  if (!isGuildConfigured(interaction.guildId)) {
    await interaction.reply({ content: 'This server isn\'t linked to Bifröst anymore.', ephemeral: true });
    return;
  }

  setSignup(interaction.guildId, eventId, interaction.user.id, status);

  try {
    await interaction.update({ components: [buildSignupRow(eventId, getSignups(interaction.guildId, eventId))] });
  } catch (error) {
    // The answer is saved even if the post can't be edited
    logger.warn(`Could not refresh sign-up counts on message ${interaction.message?.id}: ${error.message}`);
    if (!interaction.replied && !interaction.deferred) await interaction.deferUpdate().catch(() => {});
  }

  await interaction.followUp({ content: signupConfirmation(status), ephemeral: true });
}

module.exports = {
  matches,
  handle
};
