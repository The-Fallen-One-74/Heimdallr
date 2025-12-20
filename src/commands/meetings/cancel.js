const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { isGuildConfigured } = require('../../services/configManager');
const { deleteEvent, getUpcomingEvents } = require('../../services/eventManager');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('cancel')
    .setDescription('Cancel a scheduled meeting')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents)
    .addStringOption(option =>
      option.setName('meeting_id')
        .setDescription('Meeting ID (use /meetings to see IDs)')
        .setRequired(true)),

  async execute(interaction) {
    await interaction.deferReply();

    const isConfigured = isGuildConfigured(interaction.guildId);
    if (!isConfigured) {
      const embed = new EmbedBuilder()
        .setColor(0xFF9900)
        .setTitle('⚠️ Not Configured')
        .setDescription('Heimdallr is not configured for this server yet.');

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const meetingId = interaction.options.getString('meeting_id');

    try {
      // Get the meeting to verify it exists
      const events = await getUpcomingEvents(interaction.guildId, 30);
      const meeting = events.find(e => e.id === meetingId && e.event_type === 'meeting');

      if (!meeting) {
        const embed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('❌ Meeting Not Found')
          .setDescription(`No meeting found with ID: ${meetingId}\n\nUse \`/meetings\` to see all upcoming meetings.`);

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Delete the meeting
      await deleteEvent(interaction.guildId, meetingId);

      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('✅ Meeting Cancelled')
        .setDescription(`Successfully cancelled "${meeting.title}"`)
        .addFields(
          { name: '📅 Was scheduled for', value: (meeting.datetime || new Date(meeting.start_date)).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }) }
        )
        .setFooter({ text: `Cancelled by ${interaction.user.tag}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      logger.info(`${interaction.user.tag} cancelled meeting "${meeting.title}" in guild ${interaction.guildId}`);
    } catch (error) {
      logger.error('Failed to cancel meeting:', error);
      
      const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('❌ Error')
        .setDescription('Failed to cancel meeting. Please check your permissions and try again.');

      await interaction.editReply({ embeds: [embed] });
    }
  },
};
