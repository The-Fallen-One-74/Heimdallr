const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { isGuildConfigured } = require('../../services/configManager');
const { deleteEvent, getUpcomingEvents } = require('../../services/eventManager');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('cancel')
    .setDescription('Cancel a scheduled meeting')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents)
    .addIntegerOption(option =>
      option.setName('event_id')
        .setDescription('Event ID (use /meetings to see IDs)')
        .setRequired(true)),

  async execute(interaction) {
    await interaction.deferReply();

    if (!isGuildConfigured(interaction.guildId)) {
      await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0xFF9900).setTitle('⚠️ Not Configured').setDescription('Run `/setup` first.')]
      });
      return;
    }

    const eventId = interaction.options.getInteger('event_id');

    try {
      const events = await getUpcomingEvents(interaction.guildId, 60);
      const meeting = events.find(e => e.id === eventId);

      if (!meeting) {
        await interaction.editReply({
          embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('❌ Not Found').setDescription(`No event with ID \`${eventId}\`. Use \`/meetings\` to see IDs.`)]
        });
        return;
      }

      await deleteEvent(interaction.guildId, eventId);

      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('✅ Meeting Cancelled')
        .setDescription(`Cancelled **${meeting.title}**`)
        .addFields({ name: '📅 Was scheduled for', value: new Date(meeting.event_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) })
        .setFooter({ text: `Cancelled by ${interaction.user.tag}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      logger.info(`${interaction.user.tag} cancelled event ${eventId} "${meeting.title}"`);
    } catch (error) {
      logger.error('Failed to cancel meeting:', error);
      await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('❌ Error').setDescription('Failed to cancel meeting.')]
      });
    }
  },
};
