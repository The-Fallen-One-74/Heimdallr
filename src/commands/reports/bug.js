const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { isGuildConfigured, getGuildConfig } = require('../../services/configManager');
const { getBifrostClient } = require('../../services/bifrostClient');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bug')
    .setDescription('Report a bug in Bifröst')
    .addStringOption(option =>
      option.setName('title')
        .setDescription('Short bug title')
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
    const client = getBifrostClient();
    if (!client) {
      await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('❌ Error').setDescription('Database connection failed.')]
      });
      return;
    }

    const title = interaction.options.getString('title');
    const steps = interaction.options.getString('steps');
    const severity = interaction.options.getString('severity') || 'major';
    const description = interaction.options.getString('description') || '';

    try {
      // Get the first project for this org
      const { data: projects } = await client
        .from('projects')
        .select('id')
        .eq('organization_id', config.organization_id)
        .limit(1);

      if (!projects || projects.length === 0) {
        await interaction.editReply({
          embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('❌ Error').setDescription('No projects found for this organization.')]
        });
        return;
      }

      // Get the first department
      const { data: departments } = await client
        .from('departments')
        .select('id')
        .eq('organization_id', config.organization_id)
        .limit(1);

      const deptId = departments?.[0]?.id || null;

      // Insert the bug
      const { data, error } = await client
        .from('tasks')
        .insert({
          title,
          description: description || null,
          type: 'bug',
          priority: severity === 'blocker' ? 'critical' : severity === 'major' ? 'high' : 'medium',
          severity,
          steps_to_reproduce: steps,
          reported_by: interaction.user.tag,
          column_id: 'product-backlog',
          project_id: projects[0].id,
          department_id: deptId,
        })
        .select('id')
        .single();

      if (error) throw error;

      const severityEmoji = { cosmetic: '🟡', minor: '🟠', major: '🔴', blocker: '⛔' };

      const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle(`🐛 Bug Reported: ${title}`)
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

      await interaction.editReply({ embeds: [embed] });

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
