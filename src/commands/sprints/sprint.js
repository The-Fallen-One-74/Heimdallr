const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { isGuildConfigured } = require('../../services/configManager');
const { getCurrentSprint } = require('../../services/eventManager');
const { createSprintEmbed } = require('../../utils/embeds');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sprint')
    .setDescription('View current sprint information'),

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
      const sprint = await getCurrentSprint(interaction.guildId);

      if (!sprint) {
        const embed = new EmbedBuilder()
          .setColor(0x00D9FF)
          .setTitle('🏃 Current Sprint')
          .setDescription('No active sprint at the moment.')
          .setFooter({ text: 'Heimdallr is watching' })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const embed = createSprintEmbed(sprint);
      
      // Calculate days remaining
      const now = new Date();
      const end = new Date(sprint.end_date);
      const daysRemaining = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
      
      if (daysRemaining > 0) {
        embed.addFields({
          name: '⏳ Days Remaining',
          value: `${daysRemaining} day(s)`,
          inline: true
        });
      }

      embed.setFooter({ text: 'Heimdallr is watching' });

      await interaction.editReply({ embeds: [embed] });
      logger.info(`${interaction.user.tag} viewed current sprint for guild ${interaction.guildId}`);
    } catch (error) {
      logger.error('Failed to fetch sprint:', error);
      
      const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('❌ Error')
        .setDescription('Failed to fetch sprint information from Bifröst. Please check your configuration.');

      await interaction.editReply({ embeds: [embed] });
    }
  },
};
