const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { isGuildConfigured } = require('../../services/configManager');
const { getRSVPStats } = require('../../services/rsvpTracker');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('attendees')
    .setDescription('View who\'s attending a meeting')
    .addStringOption(option =>
      option.setName('message_id')
        .setDescription('Message ID of the meeting notification')
        .setRequired(true)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    if (!isGuildConfigured(interaction.guildId)) {
      await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0xFF9900).setTitle('⚠️ Not Configured').setDescription('Run `/setup` first.')]
      });
      return;
    }

    const messageId = interaction.options.getString('message_id');

    try {
      const stats = getRSVPStats(messageId);

      if (stats.total === 0) {
        await interaction.editReply({
          embeds: [new EmbedBuilder().setColor(0xFF9900).setTitle('📊 No RSVPs Yet').setDescription('No one has reacted to this meeting yet.')]
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📊 Meeting Attendees')
        .setDescription(`${stats.total} response(s)`)
        .setTimestamp();

      const attending = stats.users.filter(u => u.reaction === '✅');
      const declined = stats.users.filter(u => u.reaction === '❌');
      const maybe = stats.users.filter(u => u.reaction === '❓');

      if (attending.length > 0) {
        embed.addFields({
          name: `✅ Attending (${attending.length})`,
          value: attending.map(u => `<@${u.userId}>`).join('\n')
        });
      }

      if (declined.length > 0) {
        embed.addFields({
          name: `❌ Not Attending (${declined.length})`,
          value: declined.map(u => `<@${u.userId}>`).join('\n')
        });
      }

      if (maybe.length > 0) {
        embed.addFields({
          name: `❓ Maybe (${maybe.length})`,
          value: maybe.map(u => `<@${u.userId}>`).join('\n')
        });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error('Failed to get attendees:', error);
      await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('❌ Error').setDescription('Failed to get attendees.')]
      });
    }
  },
};
