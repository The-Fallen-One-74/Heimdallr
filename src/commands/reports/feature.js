const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { isGuildConfigured, getGuildConfig } = require('../../services/configManager');
const { submitReport } = require('../../services/reportBoard');
const { trackReportPost } = require('../../services/reportPosts');
const { fitTitle } = require('../../utils/embeds');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('feature')
    .setDescription('Submit a feature request')
    .addStringOption(option =>
      option.setName('title')
        .setDescription('Feature title')
        .setMaxLength(200)
        .setRequired(true))
    .addStringOption(option =>
      option.setName('description')
        .setDescription('Describe the feature you want')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('priority')
        .setDescription('How important is this?')
        .setRequired(false)
        .addChoices(
          { name: '🟢 Low — Nice to have', value: 'low' },
          { name: '🟡 Medium — Would help', value: 'medium' },
          { name: '🔴 High — Really need this', value: 'high' }
        )),

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
    const description = interaction.options.getString('description');
    const priority = interaction.options.getString('priority') || 'medium';

    try {
      const data = await submitReport(config, {
        type: 'feature',
        title,
        description,
        priority,
        reporterTag: interaction.user.tag
      });

      const priorityEmoji = { low: '🟢', medium: '🟡', high: '🔴' };

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(fitTitle(`💡 Feature Request: ${title}`))
        .setDescription(description.substring(0, 2048))
        .addFields(
          { name: 'Priority', value: `${priorityEmoji[priority] || '🟡'} ${priority.charAt(0).toUpperCase() + priority.slice(1)}`, inline: true },
          { name: 'Task ID', value: `\`#${data.id}\``, inline: true },
        )
        .setFooter({ text: `Requested by ${interaction.user.tag}` })
        .setTimestamp();

      const reply = await interaction.editReply({ embeds: [embed] });

      // Status changes on the Bifröst board are posted as replies here
      trackReportPost({
        taskId: data.id,
        guildId: interaction.guildId,
        channelId: reply.channelId,
        messageId: reply.id,
        type: 'feature',
        title,
        reporterId: interaction.user.id
      });

      // Also post to notification channel
      if (config.notification_channel_id) {
        try {
          const channel = await interaction.guild.channels.fetch(config.notification_channel_id);
          if (channel) {
            const msg = await channel.send({ embeds: [embed] });
            // Add voting reactions
            await msg.react('👍');
            await msg.react('👎');
          }
        } catch (e) {
          logger.error('Failed to post feature notification:', e);
        }
      }

      logger.info(`${interaction.user.tag} submitted feature request "${title}" (#${data.id}) priority=${priority}`);
    } catch (error) {
      logger.error('Failed to submit feature request:', error);
      await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('❌ Error').setDescription(`Failed to submit feature request: ${error.message}`)]
      });
    }
  },
};
