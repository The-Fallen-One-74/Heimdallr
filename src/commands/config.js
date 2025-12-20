const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getGuildConfig, isGuildConfigured } = require('../services/configManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('View current Heimdallr configuration (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const isConfigured = await isGuildConfigured(interaction.guildId);

    if (!isConfigured) {
      const embed = new EmbedBuilder()
        .setColor(0xFF9900)
        .setTitle('⚠️ Not Configured')
        .setDescription('Heimdallr is not configured for this server yet.')
        .addFields({
          name: 'Setup Required',
          value: 'Use `/setup` to connect Heimdallr to your Bifröst instance.'
        });

      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    const config = await getGuildConfig(interaction.guildId);

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🛡️ Heimdallr Configuration')
      .addFields(
        { name: '📢 Notification Channel', value: `<#${config.notification_channel_id}>`, inline: true },
        { name: '🌍 Timezone', value: config.timezone, inline: true },
        { name: '🔗 Bifröst Status', value: '✅ Connected', inline: false },
        { 
          name: '⏰ Meeting Reminders', 
          value: config.reminder_times?.meeting?.map(m => `${m}min`).join(', ') || 'Default',
          inline: true 
        },
        { 
          name: '🏃 Sprint Reminders', 
          value: config.reminder_times?.sprint?.map(m => `${m}min`).join(', ') || 'Default',
          inline: true 
        },
        { 
          name: '🎉 Holiday Reminders', 
          value: config.reminder_times?.holiday?.map(m => `${m}min`).join(', ') || 'Default',
          inline: true 
        }
      )
      .setFooter({ text: 'Use /setup to update configuration' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
