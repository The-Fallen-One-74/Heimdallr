const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { isGuildConfigured } = require('../../services/configManager');
const { getUpcomingEvents } = require('../../services/eventManager');
const { createMeetingEmbed } = require('../../utils/embeds');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('meetings')
    .setDescription('List upcoming meetings')
    .addIntegerOption(option =>
      option.setName('days')
        .setDescription('Number of days to look ahead (default: 7)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(30)),

  async execute(interaction) {
    await interaction.deferReply();

    const isConfigured = isGuildConfigured(interaction.guildId);
    if (!isConfigured) {
      const embed = new EmbedBuilder()
        .setColor(0xFF9900)
        .setTitle('⚠️ Not Configured')
        .setDescription('Heimdallr is not configured for this server yet.')
        .addFields({
          name: 'Setup Required',
          value: 'An administrator needs to run `/setup` to connect to your Bifröst instance.'
        });

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const days = interaction.options.getInteger('days') || 7;

    try {
      const events = await getUpcomingEvents(interaction.guildId, days);
      const meetings = events.filter(e => e.event_type === 'meeting');

      if (meetings.length === 0) {
        const embed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('📅 Upcoming Meetings')
          .setDescription(`No meetings scheduled in the next ${days} day(s).`)
          .setFooter({ text: 'Heimdallr is watching' })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📅 Upcoming Meetings')
        .setDescription(`Found ${meetings.length} meeting(s) in the next ${days} day(s)`)
        .setFooter({ text: 'Heimdallr is watching' })
        .setTimestamp();

      // Add up to 5 meetings as fields
      meetings.slice(0, 5).forEach((meeting, index) => {
        const date = meeting.datetime || new Date(meeting.start_date);
        const dateStr = date.toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });

        const idStr = meeting.id ? `\n🆔 \`${meeting.id.substring(0, 8)}\`` : '';

        embed.addFields({
          name: `${index + 1}. ${meeting.title}`,
          value: `📅 ${dateStr}${meeting.location ? `\n📍 ${meeting.location}` : ''}${idStr}`,
          inline: false
        });
      });

      if (meetings.length > 5) {
        embed.addFields({
          name: '\u200B',
          value: `_...and ${meetings.length - 5} more meeting(s)_`,
          inline: false
        });
      }

      await interaction.editReply({ embeds: [embed] });
      logger.info(`${interaction.user.tag} viewed meetings for guild ${interaction.guildId}`);
    } catch (error) {
      logger.error('Failed to fetch meetings:', error);
      
      const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('❌ Error')
        .setDescription('Failed to fetch meetings from Bifröst. Please check your configuration.');

      await interaction.editReply({ embeds: [embed] });
    }
  },
};
