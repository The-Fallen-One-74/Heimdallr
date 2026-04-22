const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { isGuildConfigured } = require('../../services/configManager');
const { updateEvent, getUpcomingEvents } = require('../../services/eventManager');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reschedule')
    .setDescription('Reschedule a meeting')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents)
    .addIntegerOption(option =>
      option.setName('event_id')
        .setDescription('Event ID (use /meetings to see IDs)')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('date')
        .setDescription('New date (YYYY-MM-DD)')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('time')
        .setDescription('New time (e.g., 9:00 AM)')
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
    const dateStr = interaction.options.getString('date');
    const timeStr = interaction.options.getString('time');

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('❌ Invalid Date').setDescription('Use YYYY-MM-DD format')]
      });
      return;
    }

    const timeMatch = timeStr.match(/^(0?[1-9]|1[0-2]):([0-5][0-9])\s?(AM|PM|am|pm)$/);
    if (!timeMatch) {
      await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('❌ Invalid Time').setDescription('Use format like `9:00 AM`')]
      });
      return;
    }

    let hours = parseInt(timeMatch[1]);
    const minutes = timeMatch[2];
    const period = timeMatch[3].toUpperCase();
    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
    const time24 = `${hours.toString().padStart(2, '0')}:${minutes}`;

    try {
      const events = await getUpcomingEvents(interaction.guildId, 60);
      const meeting = events.find(e => e.id === eventId);

      if (!meeting) {
        await interaction.editReply({
          embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('❌ Not Found').setDescription(`No event with ID \`${eventId}\`.`)]
        });
        return;
      }

      const oldDate = new Date(meeting.event_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

      await updateEvent(interaction.guildId, eventId, {
        event_date: dateStr,
        event_time: time24
      });

      const newDate = new Date(`${dateStr}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('✅ Meeting Rescheduled')
        .setDescription(`**${meeting.title}**`)
        .addFields(
          { name: '📅 Old Date', value: oldDate, inline: true },
          { name: '📅 New Date', value: `${newDate} at ${timeStr}`, inline: true }
        )
        .setFooter({ text: `Rescheduled by ${interaction.user.tag}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      logger.info(`${interaction.user.tag} rescheduled event ${eventId} to ${dateStr} ${timeStr}`);
    } catch (error) {
      logger.error('Failed to reschedule:', error);
      await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('❌ Error').setDescription('Failed to reschedule.')]
      });
    }
  },
};
