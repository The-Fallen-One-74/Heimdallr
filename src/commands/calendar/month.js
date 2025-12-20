const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { isGuildConfigured } = require('../../services/configManager');
const { getUpcomingEvents } = require('../../services/eventManager');
const { formatEventType } = require('../../utils/embeds');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('month')
    .setDescription('Show this month\'s events'),

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
      const events = await getUpcomingEvents(interaction.guildId, 30);
      
      const now = new Date();
      const monthName = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`📅 ${monthName} Events`)
        .setTimestamp();

      if (events.length === 0) {
        embed.setDescription('No events scheduled for this month.');
      } else {
        embed.setDescription(`You have ${events.length} event(s) this month`);

        // Show up to 15 events
        const displayEvents = events.slice(0, 15);
        
        displayEvents.forEach((event, index) => {
          const date = event.datetime || new Date(event.start_date);
          const dateStr = date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          });

          embed.addFields({
            name: `${index + 1}. ${event.title}`,
            value: `${formatEventType(event.event_type)} - ${dateStr}`,
            inline: true
          });
        });

        if (events.length > 15) {
          embed.addFields({
            name: '\u200B',
            value: `_...and ${events.length - 15} more event(s)_`,
            inline: false
          });
        }
      }

      embed.setFooter({ text: 'Heimdallr is watching' });

      await interaction.editReply({ embeds: [embed] });
      logger.info(`${interaction.user.tag} viewed month events for guild ${interaction.guildId}`);
    } catch (error) {
      logger.error('Failed to fetch month events:', error);
      
      const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('❌ Error')
        .setDescription('Failed to fetch events from Bifröst. Please check your configuration.');

      await interaction.editReply({ embeds: [embed] });
    }
  },
};
