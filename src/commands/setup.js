const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { saveGuildConfig } = require('../services/configManager');
const { verifyOrganization } = require('../services/bifrostClient');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure Heimdallr for your server (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addIntegerOption(option =>
      option.setName('organization_id')
        .setDescription('Your Bifröst organization ID')
        .setRequired(true))
    .addChannelOption(option =>
      option.setName('notification_channel')
        .setDescription('Channel for event notifications')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('timezone')
        .setDescription('Your timezone')
        .setRequired(false)
        .addChoices(
          { name: 'Eastern (ET)', value: 'America/New_York' },
          { name: 'Central (CT)', value: 'America/Chicago' },
          { name: 'Mountain (MT)', value: 'America/Denver' },
          { name: 'Pacific (PT)', value: 'America/Los_Angeles' },
          { name: 'Alaska (AKT)', value: 'America/Anchorage' },
          { name: 'Hawaii (HT)', value: 'Pacific/Honolulu' },
          { name: 'London (GMT/BST)', value: 'Europe/London' },
          { name: 'Central Europe (CET)', value: 'Europe/Berlin' },
          { name: 'Eastern Europe (EET)', value: 'Europe/Helsinki' },
          { name: 'India (IST)', value: 'Asia/Kolkata' },
          { name: 'Japan (JST)', value: 'Asia/Tokyo' },
          { name: 'Australia Eastern (AEST)', value: 'Australia/Sydney' },
          { name: 'Brazil (BRT)', value: 'America/Sao_Paulo' },
          { name: 'UTC', value: 'UTC' }
        )),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const orgId = interaction.options.getInteger('organization_id');
    const notificationChannel = interaction.options.getChannel('notification_channel');
    const timezone = interaction.options.getString('timezone') || 'America/New_York';

    // Verify the organization exists
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🔧 Setting up Heimdallr...')
      .setDescription('Verifying your Bifröst organization...');

    await interaction.editReply({ embeds: [embed] });

    const org = await verifyOrganization(orgId);

    if (!org) {
      embed
        .setColor(0xFF0000)
        .setTitle('❌ Setup Failed')
        .setDescription(`Could not find organization with ID \`${orgId}\`. Check your Bifröst organization settings.`);

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Save configuration
    try {
      saveGuildConfig(interaction.guildId, {
        organization_id: orgId,
        organization_name: org.name,
        notification_channel_id: notificationChannel.id,
        timezone: timezone,
        reminder_times: {
          meeting: [1440, 60, 15],
          work_session: [60, 15],
          social: [1440, 60],
          holiday: [1440]
        }
      });

      embed
        .setColor(0x00FF00)
        .setTitle('✅ Setup Complete!')
        .setDescription(`Heimdallr is now watching over **${org.name}**!`)
        .addFields(
          { name: '🏢 Organization', value: org.name, inline: true },
          { name: '📢 Notifications', value: `<#${notificationChannel.id}>`, inline: true },
          { name: '🌍 Timezone', value: timezone, inline: true }
        )
        .setFooter({ text: 'Use /config to view or update settings' });

      await interaction.editReply({ embeds: [embed] });
      logger.info(`Guild ${interaction.guildId} linked to org "${org.name}" (${orgId})`);
    } catch (error) {
      logger.error('Setup failed:', error);
      embed
        .setColor(0xFF0000)
        .setTitle('❌ Setup Failed')
        .setDescription('An error occurred while saving your configuration.');

      await interaction.editReply({ embeds: [embed] });
    }
  },
};
