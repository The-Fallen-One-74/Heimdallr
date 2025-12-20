const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { isGuildConfigured } = require('../../services/configManager');
const { updateEvent, getUpcomingEvents } = require('../../services/eventManager');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reschedule')
    .setDescription('Reschedule a meeting to a new date/time')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents)
    .addStringOption(option =>
      option.setName('meeting_id')
        .setDescription('Meeting ID (use /meetings to see IDs)')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('date')
        .setDescription('New date (YYYY-MM-DD format, e.g., 2025-12-25)')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('time')
        .setDescription('New time (12-hour format, e.g., 9:00 AM, 2:30 PM)')
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
    const dateStr = interaction.options.getString('date');
    const timeStr = interaction.options.getString('time');

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dateStr)) {
      const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('❌ Invalid Date Format')
        .setDescription('Please use YYYY-MM-DD format (e.g., 2025-12-25)');

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Validate time format (12-hour with AM/PM)
    const timeRegex = /^(0?[1-9]|1[0-2]):([0-5][0-9])\s?(AM|PM|am|pm)$/;
    const timeMatch = timeStr.match(timeRegex);
    
    if (!timeMatch) {
      const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('❌ Invalid Time Format')
        .setDescription('Please use 12-hour format with AM/PM:\n• 9:00 AM\n• 2:30 PM\n• 11:45 PM');

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Convert 12-hour to 24-hour format for database
    let hours = parseInt(timeMatch[1]);
    const minutes = timeMatch[2];
    const period = timeMatch[3].toUpperCase();
    
    if (period === 'PM' && hours !== 12) {
      hours += 12;
    } else if (period === 'AM' && hours === 12) {
      hours = 0;
    }
    
    const time24 = `${hours.toString().padStart(2, '0')}:${minutes}`;

    // Validate date is in the future
    const newDate = new Date(`${dateStr}T${time24}`);
    if (newDate < new Date()) {
      const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('❌ Invalid Date')
        .setDescription('Meeting date must be in the future.');

      await interaction.editReply({ embeds: [embed] });
      return;
    }

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

      const oldDate = meeting.datetime || new Date(meeting.start_date);

      // Update the meeting
      await updateEvent(interaction.guildId, meetingId, {
        start_date: dateStr,
        start_time: `${time24}:00`
      });

      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('✅ Meeting Rescheduled')
        .setDescription(`Successfully rescheduled "${meeting.title}"`)
        .addFields(
          { 
            name: '📅 Old Date/Time', 
            value: oldDate.toLocaleString('en-US', { 
              weekday: 'long', 
              month: 'long', 
              day: 'numeric', 
              hour: 'numeric', 
              minute: '2-digit' 
            }), 
            inline: false 
          },
          { 
            name: '📅 New Date/Time', 
            value: newDate.toLocaleString('en-US', { 
              weekday: 'long', 
              month: 'long', 
              day: 'numeric', 
              hour: 'numeric', 
              minute: '2-digit' 
            }), 
            inline: false 
          }
        )
        .addFields({
          name: '🔔 Reminders',
          value: 'New reminders will be sent for the updated time.',
          inline: false
        })
        .setFooter({ text: `Rescheduled by ${interaction.user.tag}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      logger.info(`${interaction.user.tag} rescheduled meeting "${meeting.title}" to ${dateStr} ${timeStr} in guild ${interaction.guildId}`);
    } catch (error) {
      logger.error('Failed to reschedule meeting:', error);
      
      const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('❌ Error')
        .setDescription('Failed to reschedule meeting. Please check your permissions and try again.');

      await interaction.editReply({ embeds: [embed] });
    }
  },
};
