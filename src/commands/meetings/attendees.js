const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { isGuildConfigured } = require('../../services/configManager');
const { getUpcomingEvents } = require('../../services/eventManager');
const { getSignups } = require('../../services/signups');
const { fitTitle } = require('../../utils/embeds');
const logger = require('../../utils/logger');

// Discord embed field values are capped at 1024 characters
function mentionList(userIds) {
  const text = userIds.map(id => `<@${id}>`).join('\n');
  return text.length <= 1024 ? text : `${text.substring(0, 1000).replace(/\n[^\n]*$/, '')}\n…`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('attendees')
    .setDescription('See who signed up for an event')
    .addIntegerOption(option =>
      option.setName('event_id')
        .setDescription('Event ID (use /meetings to see IDs)')
        .setRequired(true)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    if (!isGuildConfigured(interaction.guildId)) {
      await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0xFF9900).setTitle('⚠️ Not Configured').setDescription('Run `/setup` first.')]
      });
      return;
    }

    const eventId = interaction.options.getInteger('event_id');

    try {
      const events = await getUpcomingEvents(interaction.guildId, 60);
      const event = events.find(e => e.id === eventId);
      const groups = getSignups(interaction.guildId, eventId);
      const total = groups.going.length + groups.maybe.length + groups.not_going.length;

      if (!event && total === 0) {
        await interaction.editReply({
          embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('❌ Not Found').setDescription(`No upcoming event with ID \`${eventId}\`. Use \`/meetings\` to see IDs.`)]
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(fitTitle(`📊 Sign-ups: ${event?.title || `Event #${eventId}`}`))
        .setDescription(total ? `${total} response(s)` : 'No one has signed up yet.')
        .setTimestamp();

      const sections = [
        ['going', '✅ Joining'],
        ['maybe', '❓ Maybe'],
        ['not_going', '❌ Can\'t make it']
      ];
      for (const [status, label] of sections) {
        if (groups[status].length) {
          embed.addFields({ name: `${label} (${groups[status].length})`, value: mentionList(groups[status]) });
        }
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error('Failed to get attendees:', error);
      await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('❌ Error').setDescription('Failed to get sign-ups.')]
      });
    }
  },
};
