const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { isGuildConfigured, getGuildConfig } = require('../../services/configManager');
const { createEvent } = require('../../services/eventManager');
const { linkEventToMessage } = require('../../services/eventMessageMap');
const { discordTimestamp, toUnixTimestamp } = require('../../utils/embeds');
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
        .setDescription('Date (YYYY-MM-DD)')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('time')
        .setDescription('Time (e.g., 9:00 AM, 2:30 PM)')
        .setRequired(true))
    .addRoleOption(option =>
      option.setName('notify_role')
        .setDescription('Role to notify')
        .setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply();

    if (!isGuildConfigured(interaction.guildId)) {
      await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0xFF9900).setTitle('⚠️ Not Configured').setDescription('Run `/setup` first.')]
      });
      return;
    }

    const title = interaction.options.getString('title');
    const dateStr = interaction.options.getString('date');
    const timeStr = interaction.options.getString('time');
    const notifyRole = interaction.options.getRole('notify_role');

    // Validate date
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('❌ Invalid Date').setDescription('Use YYYY-MM-DD format')]
      });
      return;
    }

    // Parse 12h time to 24h
    const timeMatch = timeStr.match(/^(0?[1-9]|1[0-2]):([0-5][0-9])\s?(AM|PM|am|pm)$/);
    if (!timeMatch) {
      await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('❌ Invalid Time').setDescription('Use format like `9:00 AM` or `2:30 PM`')]
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
      const event = await createEvent(interaction.guildId, {
        title,
        type: 'meeting',
        event_date: dateStr,
        event_time: time24
      });

      const unix = toUnixTimestamp(dateStr, time24);
      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('✅ Meeting Scheduled')
        .setDescription(`**${title}**`)
        .addFields(
          { name: '📅 When', value: `${discordTimestamp(unix, 'F')}\n${discordTimestamp(unix, 'R')}`, inline: true }
        );

      if (notifyRole) embed.addFields({ name: '🔔 Notify', value: `<@&${notifyRole.id}>` });

      embed.addFields({ name: '🆔 Event ID', value: `\`${event.id}\``, inline: false });
      embed.setFooter({ text: `Scheduled by ${interaction.user.tag}` });
      embed.setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      // Post to notification channel
      const config = getGuildConfig(interaction.guildId);
      if (config?.notification_channel_id) {
        try {
          const channel = await interaction.guild.channels.fetch(config.notification_channel_id);
          if (channel) {
            const notifEmbed = new EmbedBuilder()
              .setColor(0x5865F2)
              .setTitle(`📅 New Meeting: ${title}`)
              .addFields(
                { name: '📅 When', value: `${discordTimestamp(unix, 'F')}\n${discordTimestamp(unix, 'R')}`, inline: true }
              )
              .setFooter({ text: `Scheduled by ${interaction.user.tag}` })
              .setTimestamp();

            const msg = await channel.send({
              content: notifyRole ? `<@&${notifyRole.id}> New meeting scheduled!` : undefined,
              embeds: [notifEmbed]
            });

            await msg.react('✅');
            await msg.react('❌');
            await msg.react('❓');

            // Link event to message so reminders can mention attendees
            linkEventToMessage(event.id, msg.id, interaction.guildId, channel.id);
          }
        } catch (e) {
          logger.error('Failed to post notification:', e);
        }
      }

      logger.info(`${interaction.user.tag} scheduled meeting "${title}" for ${dateStr} ${timeStr}`);
    } catch (error) {
      logger.error('Failed to schedule meeting:', error);
      await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('❌ Error').setDescription('Failed to schedule meeting.')]
      });
    }
  },
};
