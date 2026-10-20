const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { isGuildConfigured, getGuildConfig, saveGuildConfig } = require('../../services/configManager');
const { getDailySettings, sendDailyPost, getLocalNow } = require('../../services/dailyDigest');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Configure the daily post: who\'s out today and upcoming milestones (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addBooleanOption(option =>
      option.setName('enabled')
        .setDescription('Send the daily post')
        .setRequired(false))
    .addIntegerOption(option =>
      option.setName('hour')
        .setDescription('Hour to post, in the server timezone (0-23, default 9)')
        .setMinValue(0)
        .setMaxValue(23)
        .setRequired(false))
    .addBooleanOption(option =>
      option.setName('out_today')
        .setDescription('List people with approved time off (names only, default off)')
        .setRequired(false))
    .addBooleanOption(option =>
      option.setName('milestones')
        .setDescription('List milestones due in the next 3 days (default on)')
        .setRequired(false))
    .addBooleanOption(option =>
      option.setName('preview')
        .setDescription('Post today\'s update now')
        .setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    if (!isGuildConfigured(interaction.guildId)) {
      await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0xFF9900).setTitle('⚠️ Not Configured').setDescription('Run `/setup` first.')]
      });
      return;
    }

    const config = getGuildConfig(interaction.guildId);
    const settings = getDailySettings(config);

    for (const name of ['enabled', 'out_today', 'milestones']) {
      const value = interaction.options.getBoolean(name);
      if (value !== null) settings[name] = value;
    }
    const hour = interaction.options.getInteger('hour');
    if (hour !== null) settings.hour = hour;

    saveGuildConfig(interaction.guildId, { daily: settings });

    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('✅ Daily Post Saved')
      .addFields(
        { name: 'Daily post', value: settings.enabled ? `On, at ${settings.hour}:00 (${config.timezone || 'America/New_York'})` : 'Off', inline: false },
        { name: '🌴 Out today', value: settings.out_today ? 'On' : 'Off', inline: true },
        { name: '🎯 Milestones', value: settings.milestones ? 'On' : 'Off', inline: true }
      )
      .setFooter({ text: 'Nothing is posted on days with nothing to report' });

    try {
      if (interaction.options.getBoolean('preview')) {
        const { date } = getLocalNow(config.timezone || 'America/New_York');
        const sent = await sendDailyPost(interaction.client, interaction.guildId, { ...config, daily: settings }, date);
        embed.addFields({ name: 'Preview', value: sent ? `Posted in <#${config.notification_channel_id}>` : 'Nothing to report today' });
      }
    } catch (error) {
      logger.error('Failed to send daily preview:', error);
      embed.addFields({ name: 'Preview', value: 'Failed to load data from Bifröst' });
    }

    await interaction.editReply({ embeds: [embed] });
    logger.info(`Guild ${interaction.guildId} daily post settings: ${JSON.stringify(settings)}`);
  },
};
