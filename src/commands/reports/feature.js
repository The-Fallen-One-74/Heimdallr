const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { isGuildConfigured, getGuildConfig } = require('../../services/configManager');
const { getBifrostClient } = require('../../services/bifrostClient');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('feature')
    .setDescription('Submit a feature request')
    .addStringOption(option =>
      option.setName('title')
        .setDescription('Feature title')
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
    const client = getBifrostClient();
    if (!client) {
      await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('❌ Error').setDescription('Database connection failed.')]
      });
      return;
    }

    const title = interaction.options.getString('title');
    const description = interaction.options.getString('description');
    const priority = interaction.options.getString('priority') || 'medium';

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

      // Insert the feature request
      const { data, error } = await client
        .from('tasks')
        .insert({
          title,
          description,
          type: 'feature',
          priority,
          reported_by: interaction.user.tag,
          column_id: 'product-backlog',
          project_id: projects[0].id,
          department_id: deptId,
        })
        .select('id')
        .single();

      if (error) throw error;

      const priorityEmoji = { low: '🟢', medium: '🟡', high: '🔴' };

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`💡 Feature Request: ${title}`)
        .setDescription(description.substring(0, 2048))
        .addFields(
          { name: 'Priority', value: `${priorityEmoji[priority] || '🟡'} ${priority.charAt(0).toUpperCase() + priority.slice(1)}`, inline: true },
          { name: 'Task ID', value: `\`#${data.id}\``, inline: true },
        )
        .setFooter({ text: `Requested by ${interaction.user.tag}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

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
