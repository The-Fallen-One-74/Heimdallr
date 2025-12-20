const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { isGuildConfigured } = require('../../services/configManager');
const { getUpcomingEvents } = require('../../services/eventManager');
const { formatEventType } = require('../../utils/embeds');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('week')
    .setDescription('Show this week\'s events'),

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

    try {
      const events = await getUpcomingEvents(interaction.guildId, 7);
      
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📅 This Week\'s Events')
        .setTimestamp();

      if (events.length === 0) {
        embed.setDescription('No events scheduled for this week.');
      } else {
        embed.setDescription(`You have ${events.length} event(s) this week`);

        // Group events by day
        const eventsByDay = {};
        events.forEach(event => {
          const date = event.datetime || new Date(event.start_date);
          const dayKey = date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
          
          if (!eventsByDay[dayKey]) {
            eventsByDay[dayKey] = [];
          }
          eventsByDay[dayKey].push(event);
        });

        // Add fields for each day
        for (const [day, dayEvents] of Object.entries(eventsByDay)) {
          const eventList = dayEvents.map(e => {
            const time = (e.datetime || new Date(e.start_date)).toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true
            });
            return `${formatEventType(e.event_type)} ${e.title} - ${time}`;
          }).join('\n');

          embed.addFields({
            name: day,
            value: eventList,
            inline: false
          });
        }
      }

      embed.setFooter({ text: 'Heimdallr is watching' });

      await interaction.editReply({ embeds: [embed] });
      logger.info(`${interaction.user.tag} viewed week events for guild ${interaction.guildId}`);
    } catch (error) {
      logger.error('Failed to fetch week events:', error);
      
      const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('❌ Error')
        .setDescription('Failed to fetch events from Bifröst. Please check your configuration.');

      await interaction.editReply({ embeds: [embed] });
    }
  },
};
