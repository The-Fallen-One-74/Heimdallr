const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { isGuildConfigured, getGuildConfig } = require('../../services/configManager');
const { createEvent } = require('../../services/eventManager');
const { linkEventToMessage } = require('../../services/eventMessageMap');
const { discordTimestamp, toUnixTimestamp } = require('../../utils/embeds');
const { parseTime12h, localToUtc } = require('../../utils/time');
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
        .setDescription('Time in the server timezone (e.g., 9:00 AM, 2:30 PM)')
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

    const time24 = parseTime12h(timeStr);
    if (!time24) {
      await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('❌ Invalid Time').setDescription('Use format like `9:00 AM` or `2:30 PM`')]
      });
      return;
    }

    // Times are entered in the server's timezone; Bifröst stores UTC
    const config = getGuildConfig(interaction.guildId);
    const utc = localToUtc(dateStr, time24, config.timezone || 'America/New_York');

    try {
      const event = await createEvent(interaction.guildId, {
        title,
        type: 'meeting',
        ...utc
      });

      const unix = toUnixTimestamp(utc.event_date, utc.event_time);
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
