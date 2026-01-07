const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { isGuildConfigured, getGuildConfig } = require('../../services/configManager');
const { createEvent } = require('../../services/eventManager');
const { createMeetingEmbed } = require('../../utils/embeds');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('schedule')
    .setDescription('Schedule a new meeting')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents)
    .addStringOption(option =>
      option.setName('title')
        .setDescription('Meeting title')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('date')
        .setDescription('Date (YYYY-MM-DD format, e.g., 2025-12-25)')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('time')
        .setDescription('Time (12-hour format, e.g., 9:00 AM, 2:30 PM)')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('description')
        .setDescription('Meeting description')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('location')
        .setDescription('Meeting location (e.g., Conference Room A, Zoom link)')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('recurring')
        .setDescription('Recurring pattern')
        .setRequired(false)
        .addChoices(
          { name: 'None (one-time)', value: 'none' },
          { name: 'Daily', value: 'daily' },
          { name: 'Weekly', value: 'weekly' },
          { name: 'Bi-weekly', value: 'biweekly' },
          { name: 'Monthly', value: 'monthly' }
        ))
    .addRoleOption(option =>
      option.setName('notify_role')
        .setDescription('Role to notify for this meeting')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('timezone')
        .setDescription('Timezone (e.g., America/New_York, Europe/London, Asia/Tokyo)')
        .setRequired(false)),

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

    const title = interaction.options.getString('title');
    const dateStr = interaction.options.getString('date');
    const timeStr = interaction.options.getString('time');
    const description = interaction.options.getString('description');
    const location = interaction.options.getString('location');
    const recurring = interaction.options.getString('recurring') || 'none';
    const notifyRole = interaction.options.getRole('notify_role');
    const timezone = interaction.options.getString('timezone') || 'America/New_York';

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
    const meetingDate = new Date(`${dateStr}T${time24}`);

    try {
      // Get guild config to find project_id
      const config = getGuildConfig(interaction.guildId);
      
      // Create the event in Bifröst
      const eventData = {
        title: title,
        description: description,
        event_type: 'meeting',
        start_date: dateStr,
        start_time: `${time24}:00`,
        location: location,
        timezone: timezone,
        is_recurring: recurring !== 'none',
        recurrence_pattern: recurring !== 'none' ? recurring : null,
        // Discord integration fields
        discord_guild_id: interaction.guildId,
        discord_role_ids: notifyRole ? [notifyRole.id] : null,
        discord_role_id: notifyRole ? notifyRole.id : null, // Keep for backward compatibility
        // Project assignment
        project_id: config?.project_id || null
      };

      const createdEvent = await createEvent(interaction.guildId, eventData);

      // Create success embed
      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('✅ Meeting Scheduled')
        .setDescription(`Successfully scheduled "${title}"`)
        .addFields(
          { name: '📅 Date', value: meetingDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }), inline: true },
          { name: '⏰ Time', value: `${timeStr} (${timezone})`, inline: true }
        );

      if (notifyRole) {
        embed.addFields({ name: '🔔 Will Notify', value: `<@&${notifyRole.id}>`, inline: false });
      }

      if (recurring !== 'none') {
        const recurringText = {
          daily: 'Daily',
          weekly: 'Weekly',
          biweekly: 'Every 2 weeks',
          monthly: 'Monthly'
        };
        embed.addFields({ name: '🔄 Recurring', value: recurringText[recurring], inline: false });
      }

      if (description) {
        embed.addFields({ name: '📝 Description', value: description, inline: false });
      }

      if (location) {
        embed.addFields({ name: '📍 Location', value: location, inline: false });
      }

      embed.addFields({
        name: '🔔 Reminders',
        value: 'Heimdallr will send reminders:\n• 24 hours before\n• 1 hour before\n• 15 minutes before',
        inline: false
      });

      embed.setFooter({ text: `Scheduled by ${interaction.user.tag}` });
      embed.setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      
      // Also post to notification channel
      try {
        const config = getGuildConfig(interaction.guildId);
        if (config && config.notification_channel_id) {
          const notificationChannel = await interaction.guild.channels.fetch(config.notification_channel_id);
          if (notificationChannel) {
            const notificationEmbed = new EmbedBuilder()
              .setColor(0x5865F2)
              .setTitle(`📅 New Meeting: ${title}`)
              .setDescription(description || 'A new meeting has been scheduled')
              .addFields(
                { name: '📅 Date', value: meetingDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }), inline: true },
                { name: '⏰ Time', value: `${timeStr} (${timezone})`, inline: true }
              );

            if (location) {
              notificationEmbed.addFields({ name: '📍 Location', value: location, inline: false });
            }

            if (recurring !== 'none') {
              const recurringText = {
                daily: 'Daily',
                weekly: 'Weekly',
                biweekly: 'Every 2 weeks',
                monthly: 'Monthly'
              };
              notificationEmbed.addFields({ name: '🔄 Recurring', value: recurringText[recurring], inline: false });
            }

            notificationEmbed.setFooter({ text: `Scheduled by ${interaction.user.tag}` });
            notificationEmbed.setTimestamp();

            // Send with role mention if applicable
            let messageContent = '';
            if (notifyRole) {
              messageContent = `<@&${notifyRole.id}> New meeting scheduled!`;
            }

            const message = await notificationChannel.send({
              content: messageContent || undefined,
              embeds: [notificationEmbed]
            });

            // Add RSVP reactions
            await message.react('✅');
            await message.react('❌');
            await message.react('❓');

            logger.info(`Posted meeting notification to channel ${config.notification_channel_id}`);
          }
        }
      } catch (notifError) {
        logger.error('Failed to post notification to channel:', notifError);
        // Don't fail the command if notification fails
      }
      
      logger.info(`${interaction.user.tag} scheduled ${recurring !== 'none' ? recurring : 'one-time'} meeting "${title}" for ${dateStr} ${timeStr} ${timezone} in guild ${interaction.guildId}`);
    } catch (error) {
      logger.error('Failed to schedule meeting:', error);
      
      const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('❌ Error')
        .setDescription('Failed to schedule meeting. Please check your permissions and try again.');

      await interaction.editReply({ embeds: [embed] });
    }
  },
};
