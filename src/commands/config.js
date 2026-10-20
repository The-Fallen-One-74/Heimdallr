const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getGuildConfig, isGuildConfigured } = require('../services/configManager');
const { getDailySettings } = require('../services/dailyDigest');

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
        { name: '🔗 Linked with', value: config.connection_id ? 'Link code' : 'Organization ID (legacy)', inline: true },
        { name: '📢 Notifications', value: `<#${config.notification_channel_id}>`, inline: true },
        { name: '🌍 Timezone', value: config.timezone || 'America/New_York', inline: true },
        {
          name: '☀️ Daily Post',
          value: (() => {
            const daily = getDailySettings(config);
            if (!daily.enabled) return 'Off';
            const parts = [daily.milestones && 'milestones', daily.out_today && 'out today'].filter(Boolean);
            return `${daily.hour}:00 — ${parts.join(', ') || 'nothing selected'}`;
          })(),
          inline: true
        },
        { name: '🏷️ Department Roles', value: `${Object.keys(config.department_roles || {}).length} mapped`, inline: true },
        { name: '🗓️ Discord Events', value: config.discord_events === false ? 'Off' : 'On', inline: true },
        { name: '📝 Report Board', value: config.report_project_name || 'First project (set with /reports)', inline: true },
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
