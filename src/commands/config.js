const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getGuildConfig, isGuildConfigured } = require('../services/configManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('View current Heimdallr configuration (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!isGuildConfigured(interaction.guildId)) {
      const embed = new EmbedBuilder()
        .setColor(0xFF9900)
        .setTitle('⚠️ Not Configured')
        .setDescription('Heimdallr is not configured for this server yet.')
        .addFields({
          name: 'Setup Required',
          value: 'Use `/setup` to connect Heimdallr to your Bifröst organization.'
        });

      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    const config = getGuildConfig(interaction.guildId);

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🛡️ Heimdallr Configuration')
      .addFields(
        { name: '🏢 Organization', value: config.organization_name || `ID: ${config.organization_id}`, inline: true },
        { name: '📢 Notifications', value: `<#${config.notification_channel_id}>`, inline: true },
        { name: '🌍 Timezone', value: config.timezone || 'America/New_York', inline: true },
        {
          name: '⏰ Meeting Reminders',
          value: config.reminder_times?.meeting?.map(m => formatMinutes(m)).join(', ') || '24h, 1h, 15m',
          inline: true
        }
      )
      .setFooter({ text: 'Use /setup to update configuration' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

function formatMinutes(m) {
  if (m >= 1440) return `${Math.floor(m / 1440)}d`;
  if (m >= 60) return `${Math.floor(m / 60)}h`;
  return `${m}m`;
}
