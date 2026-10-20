const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getGuildConfig, saveGuildConfig } = require('../services/configManager');
const { redeemLinkCode } = require('../services/discordLink');
const logger = require('../utils/logger');

const DEFAULT_REMINDER_TIMES = {
  meeting: [1440, 60, 15],
  company: [1440, 60],
  retrospective: [60, 15],
  holiday: [1440]
};

const REDEEM_ERRORS = {
  invalid_code: 'That code is invalid, expired or already used. Create a new one in Bifröst **Org Settings → Discord**.',
  rate_limited: 'Too many tries. Wait 10 minutes, then create a new code.',
  not_available: 'Link codes aren\'t turned on in Bifröst yet.',
  failed: 'Could not reach Bifröst. Try again in a minute.'
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Connect Heimdallr to your Bifröst organization (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(option =>
      option.setName('notification_channel')
        .setDescription('Channel for event notifications')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('code')
        .setDescription('Link code from Bifröst Org Settings → Discord, e.g. BFR-7K2Q-M9XD')
        .setRequired(false))
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
        ))
    .addBooleanOption(option =>
      option.setName('discord_events')
        .setDescription('Also list meetings in the server Events tab (default: on)')
        .setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const code = interaction.options.getString('code');
    const notificationChannel = interaction.options.getChannel('notification_channel');
    const existing = getGuildConfig(interaction.guildId);
    const timezone = interaction.options.getString('timezone') || existing?.timezone || 'America/New_York';
    const discordEvents = interaction.options.getBoolean('discord_events') ?? existing?.discord_events ?? true;

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🔧 Setting up Heimdallr...')
      .setDescription('Connecting to Bifröst...');

    await interaction.editReply({ embeds: [embed] });

    const fail = async description => {
      embed.setColor(0xFF0000).setTitle('❌ Setup Failed').setDescription(description);
      await interaction.editReply({ embeds: [embed] });
    };

    // Without a code, /setup only updates the channel, timezone and events of a linked server
    if (!code && !existing?.connection_id) {
      await fail('Add the `code` from Bifröst **Org Settings → Discord** to link this server.');
      return;
    }

    let link;
    if (code) {
      const result = await redeemLinkCode({
        code,
        guild: interaction.guild,
        discordUserId: interaction.user.id,
        notificationChannelId: notificationChannel.id,
        timezone
      });

      if (!result.ok) {
        await fail(REDEEM_ERRORS[result.error] || REDEEM_ERRORS.failed);
        return;
      }

      link = {
        connection_id: result.connection_id,
        organization_id: result.organization_id,
        organization_name: result.organization_name
      };
    }

    try {
      saveGuildConfig(interaction.guildId, {
        ...link,
        notification_channel_id: notificationChannel.id,
        timezone,
        discord_events: discordEvents,
        reminder_times: existing?.reminder_times || DEFAULT_REMINDER_TIMES
      });

      const config = getGuildConfig(interaction.guildId);
      embed
        .setColor(0x00FF00)
        .setTitle('✅ Setup Complete!')
        .setDescription(`Heimdallr is now watching over **${config.organization_name}**!`)
        .addFields(
          { name: '🏢 Organization', value: config.organization_name, inline: true },
          { name: '📢 Notifications', value: `<#${notificationChannel.id}>`, inline: true },
          { name: '🌍 Timezone', value: timezone, inline: true },
          { name: '🗓️ Discord Events', value: discordEvents ? 'On' : 'Off', inline: true }
        )
        .setFooter({ text: 'Use /config to view settings' });

      await interaction.editReply({ embeds: [embed] });
      logger.info(`Guild ${interaction.guildId} linked to org "${config.organization_name}" (${config.organization_id}) via connection ${config.connection_id}`);
    } catch (error) {
      logger.error('Setup failed:', error);
      await fail('An error occurred while saving your configuration.');
    }
  },
};
