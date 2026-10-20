const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { isGuildConfigured, getGuildConfig } = require('../../services/configManager');
const { updateEvent, getUpcomingEvents } = require('../../services/eventManager');
const { updateDiscordEvent } = require('../../services/discordEvents');
const { discordTimestamp, toUnixTimestamp } = require('../../utils/embeds');
const { parseTime12h, localToUtc } = require('../../utils/time');
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
        .setDescription('New time in the server timezone (e.g., 9:00 AM)')
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

    const time24 = parseTime12h(timeStr);
    if (!time24) {
      await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('❌ Invalid Time').setDescription('Use format like `9:00 AM`')]
      });
      return;
    }

    // Times are entered in the server's timezone; Bifröst stores UTC
    const config = getGuildConfig(interaction.guildId);
    const utc = localToUtc(dateStr, time24, config.timezone || 'America/New_York');

    try {
      const events = await getUpcomingEvents(interaction.guildId, 60);
      const meeting = events.find(e => e.id === eventId);

      if (!meeting) {
        await interaction.editReply({
          embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('❌ Not Found').setDescription(`No event with ID \`${eventId}\`.`)]
        });
        return;
      }

      const oldUnix = toUnixTimestamp(meeting.event_date, meeting.event_time);

      await updateEvent(interaction.guildId, eventId, utc);
      await updateDiscordEvent(interaction.guild, { ...meeting, ...utc });

      const newUnix = toUnixTimestamp(utc.event_date, utc.event_time);

      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('✅ Meeting Rescheduled')
        .setDescription(`**${meeting.title}**`)
        .addFields(
          { name: '📅 Old Time', value: discordTimestamp(oldUnix, 'F'), inline: true },
          { name: '📅 New Time', value: `${discordTimestamp(newUnix, 'F')}\n${discordTimestamp(newUnix, 'R')}`, inline: true }
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
