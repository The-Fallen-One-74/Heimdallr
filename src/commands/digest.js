const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { isGuildConfigured } = require('../services/configManager');
const { getUpcomingEvents, getHolidays } = require('../services/eventManager');
const { formatEventType } = require('../utils/embeds');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('digest')
    .setDescription('Get a summary of upcoming events'),

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

    try {
      const now = new Date();
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextWeek = new Date(today);
      nextWeek.setDate(nextWeek.getDate() + 7);

      // Get events
      const allEvents = await getUpcomingEvents(interaction.guildId, 7);
      const holidays = await getHolidays(interaction.guildId, 7);

      // Filter by time periods
      const todayEvents = allEvents.filter(e => {
        const date = e.datetime || new Date(e.start_date);
        return date >= today && date < tomorrow;
      });

      const tomorrowEvents = allEvents.filter(e => {
        const date = e.datetime || new Date(e.start_date);
        return date >= tomorrow && date < new Date(tomorrow.getTime() + 24 * 60 * 60 * 1000);
      });

      const thisWeekEvents = allEvents.filter(e => {
        const date = e.datetime || new Date(e.start_date);
        return date >= tomorrow && date < nextWeek;
      });

      const upcomingHolidays = holidays.filter(h => {
        const date = h.datetime || new Date(h.start_date);
        return date >= today && date < nextWeek;
      });

      // Create digest embed
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📊 Event Digest')
        .setDescription(`Summary for ${today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`)
        .setTimestamp();

      // Today's events
      if (todayEvents.length > 0) {
        const todayList = todayEvents.slice(0, 3).map(e => {
          const time = (e.datetime || new Date(e.start_date)).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          });
          return `${formatEventType(e.event_type)} ${e.title} - ${time}`;
        }).join('\n');

        embed.addFields({
          name: `📅 Today (${todayEvents.length})`,
          value: todayList + (todayEvents.length > 3 ? `\n_...and ${todayEvents.length - 3} more_` : ''),
          inline: false
        });
      } else {
        embed.addFields({
          name: '📅 Today',
          value: 'No events scheduled',
          inline: false
        });
      }

      // Tomorrow's events
      if (tomorrowEvents.length > 0) {
        const tomorrowList = tomorrowEvents.slice(0, 3).map(e => {
          const time = (e.datetime || new Date(e.start_date)).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          });
          return `${formatEventType(e.event_type)} ${e.title} - ${time}`;
        }).join('\n');

        embed.addFields({
          name: `📅 Tomorrow (${tomorrowEvents.length})`,
          value: tomorrowList + (tomorrowEvents.length > 3 ? `\n_...and ${tomorrowEvents.length - 3} more_` : ''),
          inline: false
        });
      }

      // This week
      if (thisWeekEvents.length > 0) {
        embed.addFields({
          name: '📅 This Week',
          value: `${thisWeekEvents.length} event(s) scheduled`,
          inline: true
        });
      }

      // Upcoming holidays
      if (upcomingHolidays.length > 0) {
        const holidayList = upcomingHolidays.map(h => {
          const date = h.datetime || new Date(h.start_date);
          const daysUntil = Math.ceil((date - now) / (1000 * 60 * 60 * 24));
          return `🎉 ${h.title || h.name} - ${daysUntil === 0 ? 'Today' : daysUntil === 1 ? 'Tomorrow' : `in ${daysUntil} days`}`;
        }).join('\n');

        embed.addFields({
          name: '🎉 Upcoming Holidays',
          value: holidayList,
          inline: false
        });
      }

      embed.setFooter({ text: 'Use /today, /week, or /month for more details' });

      await interaction.editReply({ embeds: [embed] });
      logger.info(`${interaction.user.tag} viewed digest for guild ${interaction.guildId}`);
    } catch (error) {
      logger.error('Failed to generate digest:', error);
      
      const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('❌ Error')
        .setDescription('Failed to generate digest. Please try again.');

      await interaction.editReply({ embeds: [embed] });
    }
  },
};
