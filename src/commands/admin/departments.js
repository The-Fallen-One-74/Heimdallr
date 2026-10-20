const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { isGuildConfigured, getGuildConfig, saveGuildConfig } = require('../../services/configManager');
const { listDepartments } = require('../../services/departmentRoles');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('departments')
    .setDescription('Tag a Discord role for a Bifröst department\'s meetings and milestones (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(option =>
      option.setName('department')
        .setDescription('Bifröst department')
        .setRequired(true)
        .setAutocomplete(true))
    .addRoleOption(option =>
      option.setName('role')
        .setDescription('Discord role to tag (leave empty to remove the mapping)')
        .setRequired(false)),

  async autocomplete(interaction) {
    const config = getGuildConfig(interaction.guildId);
    if (!config?.organization_id) return interaction.respond([]);

    try {
      const focused = interaction.options.getFocused().toLowerCase();
      const departments = await listDepartments(config.organization_id);
      await interaction.respond(
        departments
          .filter(d => d.name.toLowerCase().includes(focused))
          .slice(0, 25)
          .map(d => ({ name: d.name.substring(0, 100), value: String(d.id) }))
      );
    } catch (error) {
      logger.error('Failed to list departments for autocomplete:', error);
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
    const departmentId = parseInt(interaction.options.getString('department'));
    const role = interaction.options.getRole('role');

    try {
      // Only accept departments that belong to this server's organization
      const departments = await listDepartments(config.organization_id);
      const department = departments.find(d => d.id === departmentId);

      if (!department) {
        await interaction.editReply({
          embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('❌ Not Found').setDescription('Pick a department from the list.')]
        });
        return;
      }

      const departmentRoles = { ...(config.department_roles || {}) };
      if (role) {
        departmentRoles[String(department.id)] = role.id;
      } else {
        delete departmentRoles[String(department.id)];
      }
      saveGuildConfig(interaction.guildId, { department_roles: departmentRoles });

      const description = role
        ? `**${department.name}** meetings and milestones will tag <@&${role.id}>.`
        : `**${department.name}** no longer tags a role.`;

      await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0x00FF00).setTitle('✅ Department Role Saved').setDescription(description)]
      });
      logger.info(`Guild ${interaction.guildId} mapped department ${department.id} to role ${role?.id || 'none'}`);
    } catch (error) {
      logger.error('Failed to map department role:', error);
      await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('❌ Error').setDescription('Failed to load departments.')]
      });
    }
  },
};
