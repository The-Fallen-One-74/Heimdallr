const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { isGuildConfigured, getGuildConfig } = require('../../services/configManager');
const { submitReport } = require('../../services/reportBoard');
const { trackReportPost } = require('../../services/reportPosts');
const { fitTitle } = require('../../utils/embeds');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bug')
    .setDescription('Report a bug in Bifröst')
    .addStringOption(option =>
      option.setName('title')
        .setDescription('Short bug title')
        .setMaxLength(200)
        .setRequired(true))
    .addStringOption(option =>
      option.setName('steps')
        .setDescription('Steps to reproduce')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('severity')
        .setDescription('How severe is this bug?')
        .setRequired(false)
        .addChoices(
          { name: '🟡 Cosmetic', value: 'cosmetic' },
          { name: '🟠 Minor', value: 'minor' },
          { name: '🔴 Major', value: 'major' },
          { name: '⛔ Blocker', value: 'blocker' }
        ))
    .addStringOption(option =>
      option.setName('description')
        .setDescription('Additional details')
        .setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply();

    if (!isGuildConfigured(interaction.guildId)) {
      await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0xFF9900).setTitle('⚠️ Not Configured').setDescription('Run `/setup` first.')]
      });
      return;
    }

    const config = getGuildConfig(interaction.guildId);
    const title = interaction.options.getString('title');
    const steps = interaction.options.getString('steps');
    const severity = interaction.options.getString('severity') || 'major';
    const description = interaction.options.getString('description') || '';

    try {
      const data = await submitReport(config, {
        type: 'bug',
        title,
        description,
        priority: severity === 'blocker' ? 'critical' : severity === 'major' ? 'high' : 'medium',
        severity,
        steps,
        reporterTag: interaction.user.tag
      });

      const severityEmoji = { cosmetic: '🟡', minor: '🟠', major: '🔴', blocker: '⛔' };

      const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle(fitTitle(`🐛 Bug Reported: ${title}`))
        .addFields(
          { name: 'Severity', value: `${severityEmoji[severity] || '🔴'} ${severity.charAt(0).toUpperCase() + severity.slice(1)}`, inline: true },
          { name: 'Task ID', value: `\`#${data.id}\``, inline: true },
          { name: 'Steps to Reproduce', value: steps.substring(0, 1024) },
        )
        .setFooter({ text: `Reported by ${interaction.user.tag}` })
        .setTimestamp();

      if (description) {
        embed.addFields({ name: 'Details', value: description.substring(0, 1024) });
      }

      const reply = await interaction.editReply({ embeds: [embed] });

      // Status changes on the Bifröst board are posted as replies here
      trackReportPost({
        taskId: data.id,
        guildId: interaction.guildId,
        channelId: reply.channelId,
        messageId: reply.id,
        type: 'bug',
        title,
        reporterId: interaction.user.id
      });

      // Also post to notification channel
      if (config.notification_channel_id) {
        try {
          const channel = await interaction.guild.channels.fetch(config.notification_channel_id);
          if (channel) {
            await channel.send({ embeds: [embed] });
          }
        } catch (e) {
          logger.error('Failed to post bug notification:', e);
        }
      }

      logger.info(`${interaction.user.tag} reported bug "${title}" (#${data.id}) severity=${severity}`);
    } catch (error) {
      logger.error('Failed to report bug:', error);
      await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('❌ Error').setDescription(`Failed to report bug: ${error.message}`)]
      });
    }
  },
};
