const { getBifrostClient } = require('./bifrostClient');
const { getGuildConfig } = require('./configManager');

/**
 * List an organization's departments
 * @param {number} orgId - Organization ID
 * @returns {Promise<Array<{id: number, name: string}>>}
 */
async function listDepartments(orgId) {
  const client = getBifrostClient();
  if (!client) return [];

  const { data, error } = await client
    .from('departments')
    .select('id, name')
    .eq('organization_id', orgId)
    .order('name', { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * Get the Discord role mention for a Bifröst department, if one is mapped
 * @param {string} guildId - Discord guild ID
 * @param {number|null} departmentId - Bifröst department ID
 * @returns {string|null} e.g. "<@&123>"
 */
function getDepartmentRoleMention(guildId, departmentId) {
  if (departmentId == null) return null;
  const roleId = getGuildConfig(guildId)?.department_roles?.[String(departmentId)];
  return roleId ? `<@&${roleId}>` : null;
}

module.exports = {
  listDepartments,
  getDepartmentRoleMention
};
