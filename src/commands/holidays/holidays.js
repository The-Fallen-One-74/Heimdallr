const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { isGuildConfigured } = require('../../services/configManager');
const { getHolidays } = require('../../services/eventManager');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('holidays')
    .setDescription('List upcoming holidays')
    .addIntegerOption(option =>
      option.setName('days')
        .setDescription('Number of days to look ahead (default: 365)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(730)),

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

    const days = interaction.options.getInteger('days') || 365; // Default to 1 year instead of 30 days

    try {
      const holidays = await getHolidays(interaction.guildId, days);

      if (holidays.length === 0) {
        const embed = new EmbedBuilder()
          .setColor(0xFFA500)
          .setTitle('🎉 Upcoming Holidays')
          .setDescription(`No holidays scheduled in the next ${days} day(s).`)
          .setFooter({ text: 'Heimdallr is watching' })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0xFFA500)
        .setTitle('🎉 Upcoming Holidays')
        .setDescription(`Found ${holidays.length} holiday(s) in the next ${days} day(s)`)
        .setFooter({ text: 'Heimdallr is watching' })
        .setTimestamp();

      holidays.forEach((holiday, index) => {
        const date = holiday.datetime || new Date(holiday.start_date);
        const dateStr = date.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric'
        });

        const daysUntil = Math.ceil((date - new Date()) / (1000 * 60 * 60 * 24));
        const daysText = daysUntil === 0 ? 'Today!' : daysUntil === 1 ? 'Tomorrow' : `In ${daysUntil} days`;

        const description = holiday.description || '';

        embed.addFields({
          name: `${index + 1}. ${holiday.title || holiday.name}`,
          value: `📅 ${dateStr}\n⏰ ${daysText}${description ? `\n📝 ${description}` : ''}`,
          inline: false
        });
      });

      await interaction.editReply({ embeds: [embed] });
      logger.info(`${interaction.user.tag} viewed holidays for guild ${interaction.guildId}`);
    } catch (error) {
      logger.error('Failed to fetch holidays:', error);
      
      const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('❌ Error')
        .setDescription('Failed to fetch holidays from Bifröst. Please check your configuration.');

      await interaction.editReply({ embeds: [embed] });
    }
  },
};
