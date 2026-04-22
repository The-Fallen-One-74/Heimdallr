const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { isGuildConfigured, getGuildConfig } = require('../../services/configManager');
const { getUpcomingEvents } = require('../../services/eventManager');
const { discordTimestamp, toUnixTimestamp } = require('../../utils/embeds');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('meetings')
    .setDescription('List upcoming meetings')
    .addIntegerOption(option =>
      option.setName('days')
        .setDescription('Days to look ahead (default: 7)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(30)),

  async execute(interaction) {
    await interaction.deferReply();

    if (!isGuildConfigured(interaction.guildId)) {
      await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0xFF9900).setTitle('⚠️ Not Configured').setDescription('Run `/setup` first.')]
      });
      return;
    }

    const days = interaction.options.getInteger('days') || 7;

    try {
      const events = await getUpcomingEvents(interaction.guildId, days);
      const meetings = events.filter(e => e.type === 'meeting');

      if (meetings.length === 0) {
        await interaction.editReply({
          embeds: [new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('📅 Upcoming Meetings')
            .setDescription(`No meetings in the next ${days} day(s).`)
            .setTimestamp()]
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📅 Upcoming Meetings')
        .setDescription(`${meetings.length} meeting(s) in the next ${days} day(s)`)
        .setTimestamp();

      meetings.slice(0, 10).forEach((meeting, i) => {
        const unix = toUnixTimestamp(meeting.event_date, meeting.event_time);

        embed.addFields({
          name: `${i + 1}. ${meeting.title}`,
          value: `${discordTimestamp(unix, 'F')} (${discordTimestamp(unix, 'R')})\n🆔 \`${meeting.id}\``,
          inline: false
        });
      });

      if (meetings.length > 10) {
        embed.addFields({ name: '\u200B', value: `_...and ${meetings.length - 10} more_` });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error('Failed to fetch meetings:', error);
      await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('❌ Error').setDescription('Failed to fetch meetings.')]
      });
    }
  },
};
