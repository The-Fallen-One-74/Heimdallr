const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { isGuildConfigured } = require('../../services/configManager');
const { getRSVPs } = require('../../services/rsvpTracker');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('attendees')
    .setDescription('View who\'s attending a meeting')
    .addStringOption(option =>
      option.setName('message_id')
        .setDescription('Message ID of the meeting reminder')
        .setRequired(true)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const isConfigured = isGuildConfigured(interaction.guildId);
    if (!isConfigured) {
      const embed = new EmbedBuilder()
        .setColor(0xFF9900)
        .setTitle('⚠️ Not Configured')
        .setDescription('Heimdallr is not configured for this server yet.');

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const messageId = interaction.options.getString('message_id');

    try {
      const rsvps = getRSVPs(interaction.guildId, messageId);

      if (rsvps.length === 0) {
        const embed = new EmbedBuilder()
          .setColor(0xFF9900)
          .setTitle('📊 No RSVPs Yet')
          .setDescription('No one has responded to this meeting yet.');

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const accepted = rsvps.filter(r => r.status === 'accepted');
      const declined = rsvps.filter(r => r.status === 'declined');
      const maybe = rsvps.filter(r => r.status === 'maybe');

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📊 Meeting Attendees')
        .setDescription(`Total responses: ${rsvps.length}`)
        .setTimestamp();

      if (accepted.length > 0) {
        embed.addFields({
          name: `✅ Attending (${accepted.length})`,
          value: accepted.map(r => r.userTag).join('\n'),
          inline: false
        });
      }

      if (declined.length > 0) {
        embed.addFields({
          name: `❌ Not Attending (${declined.length})`,
          value: declined.map(r => r.userTag).join('\n'),
          inline: false
        });
      }

      if (maybe.length > 0) {
        embed.addFields({
          name: `❓ Maybe (${maybe.length})`,
          value: maybe.map(r => r.userTag).join('\n'),
          inline: false
        });
      }

      await interaction.editReply({ embeds: [embed] });
      logger.info(`${interaction.user.tag} viewed attendees for message ${messageId} in guild ${interaction.guildId}`);
    } catch (error) {
      logger.error('Failed to get attendees:', error);
      
      const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('❌ Error')
        .setDescription('Failed to retrieve attendee information.');

      await interaction.editReply({ embeds: [embed] });
    }
  },
};
