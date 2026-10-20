const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { isGuildConfigured, getGuildConfig, saveGuildConfig } = require('../../services/configManager');
const { listProjects } = require('../../services/reportBoard');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reports')
    .setDescription('Choose the Bifröst project that receives /bug and /feature reports (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(option =>
      option.setName('project')
        .setDescription('Bifröst project')
        .setRequired(true)
        .setAutocomplete(true)),

  async autocomplete(interaction) {
    const config = getGuildConfig(interaction.guildId);
    if (!config?.organization_id) return interaction.respond([]);

    try {
      const focused = interaction.options.getFocused().toLowerCase();
      const projects = await listProjects(config.organization_id);
      await interaction.respond(
        projects
          .filter(p => p.name.toLowerCase().includes(focused))
          .slice(0, 25)
          .map(p => ({ name: p.name.substring(0, 100), value: String(p.id) }))
      );
    } catch (error) {
      logger.error('Failed to list projects for autocomplete:', error);
      await interaction.respond([]);
    }
  },

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    if (!isGuildConfigured(interaction.guildId)) {
      await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0xFF9900).setTitle('⚠️ Not Configured').setDescription('Run `/setup` first.')]
      });
      return;
    }

    const config = getGuildConfig(interaction.guildId);
    const projectId = parseInt(interaction.options.getString('project'));

    try {
      // Only accept projects that belong to this server's organization
      const projects = await listProjects(config.organization_id);
      const project = projects.find(p => p.id === projectId);

      if (!project) {
        await interaction.editReply({
          embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('❌ Not Found').setDescription('Pick a project from the list.')]
        });
        return;
      }

      saveGuildConfig(interaction.guildId, {
        report_project_id: project.id,
        report_project_name: project.name
      });

      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0x00FF00)
          .setTitle('✅ Report Board Set')
          .setDescription(`Bugs and feature requests will go to **${project.name}**.`)]
      });
      logger.info(`Guild ${interaction.guildId} report project set to "${project.name}" (${project.id})`);
    } catch (error) {
      logger.error('Failed to set report project:', error);
      await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('❌ Error').setDescription('Failed to load projects.')]
      });
    }
  },
};
