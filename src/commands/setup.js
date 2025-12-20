const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { saveGuildConfig } = require('../services/configManager');
const { testBifrostConnection } = require('../services/bifrostClient');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure Heimdallr for your server (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(option =>
      option.setName('supabase_url')
        .setDescription('Your Bifröst Supabase URL')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('supabase_key')
        .setDescription('Your Bifröst Supabase anon key')
        .setRequired(true))
    .addChannelOption(option =>
      option.setName('notification_channel')
        .setDescription('Channel for notifications')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('timezone')
        .setDescription('Your timezone (e.g., America/New_York)')
        .setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const supabaseUrl = interaction.options.getString('supabase_url');
    const supabaseKey = interaction.options.getString('supabase_key');
    const notificationChannel = interaction.options.getChannel('notification_channel');
    const timezone = interaction.options.getString('timezone') || 'America/New_York';

    // Test the connection
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🔧 Setting up Heimdallr...')
      .setDescription('Testing connection to your Bifröst instance...');

    await interaction.editReply({ embeds: [embed] });

    const isValid = await testBifrostConnection(supabaseUrl, supabaseKey);

    if (!isValid) {
      embed
        .setColor(0xFF0000)
        .setTitle('❌ Setup Failed')
        .setDescription('Could not connect to your Bifröst instance. Please check your credentials.');
      
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Save configuration
    try {
      await saveGuildConfig(interaction.guildId, {
        supabase_url: supabaseUrl,
        supabase_key: supabaseKey,
        notification_channel_id: notificationChannel.id,
        timezone: timezone,
        reminder_times: {
          meeting: [1440, 60, 15], // 24h, 1h, 15m before
          sprint: [1440, 60],       // 24h, 1h before
          holiday: [10080, 1440]    // 1 week, 1 day before
        }
      });

      embed
        .setColor(0x00FF00)
        .setTitle('✅ Setup Complete!')
        .setDescription('Heimdallr is now watching over your realm!')
        .addFields(
          { name: '📢 Notification Channel', value: `<#${notificationChannel.id}>`, inline: true },
          { name: '🌍 Timezone', value: timezone, inline: true },
          { name: '🔗 Status', value: 'Connected to Bifröst', inline: false }
        )
        .setFooter({ text: 'Use /config to view or update settings' });

      await interaction.editReply({ embeds: [embed] });
      logger.info(`Guild ${interaction.guildId} configured successfully`);
    } catch (error) {
      logger.error('Setup failed:', error);
      embed
        .setColor(0xFF0000)
        .setTitle('❌ Setup Failed')
        .setDescription('An error occurred while saving your configuration. Please try again.');
      
      await interaction.editReply({ embeds: [embed] });
    }
  },
};
