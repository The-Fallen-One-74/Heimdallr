const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { isGuildConfigured } = require('../../services/configManager');
const { getUpcomingEvents } = require('../../services/eventManager');
const { formatEventType } = require('../../utils/embeds');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('today')
    .setDescription('Show today\'s events'),

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
      const events = await getUpcomingEvents(interaction.guildId, 1);
      
      // Filter to only today's events
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const todayEvents = events.filter(e => {
        const eventDate = e.datetime || new Date(e.start_date);
        return eventDate >= today && eventDate < tomorrow;
      });

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📅 Today\'s Events')
        .setTimestamp();

      if (todayEvents.length === 0) {
        embed.setDescription('No events scheduled for today. Enjoy your day!');
      } else {
        embed.setDescription(`You have ${todayEvents.length} event(s) today`);

        todayEvents.forEach((event, index) => {
          const date = event.datetime || new Date(event.start_date);
          const timeStr = date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          });

          embed.addFields({
            name: `${index + 1}. ${event.title}`,
            value: `${formatEventType(event.event_type)}\n⏰ ${timeStr}${event.location ? `\n📍 ${event.location}` : ''}`,
            inline: false
          });
        });
      }

      embed.setFooter({ text: 'Heimdallr is watching' });

      await interaction.editReply({ embeds: [embed] });
      logger.info(`${interaction.user.tag} viewed today's events for guild ${interaction.guildId}`);
    } catch (error) {
      logger.error('Failed to fetch today\'s events:', error);
      
      const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('❌ Error')
        .setDescription('Failed to fetch events from Bifröst. Please check your configuration.');

      await interaction.editReply({ embeds: [embed] });
    }
  },
};
