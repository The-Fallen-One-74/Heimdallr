const { getBifrostClient } = require('./bifrostClient');

/**
 * List an organization's projects
 * @param {number} orgId - Organization ID
 * @returns {Promise<Array<{id: number, name: string}>>}
 */
async function listProjects(orgId) {
  const client = getBifrostClient();
  if (!client) return [];

  const { data, error } = await client
    .from('projects')
    .select('id, name')
    .eq('organization_id', orgId)
    .order('name', { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * Get the project that /bug and /feature reports go to.
 * Uses the project chosen with /reports, or the org's first project.
 * @param {Object} config - Guild configuration
 * @returns {Promise<{id: number, name: string}|null>}
 */
async function getReportProject(config) {
  const client = getBifrostClient();
  if (!client) return null;

  if (config.report_project_id) {
    const { data } = await client
      .from('projects')
      .select('id, name')
      .eq('id', config.report_project_id)
      .eq('organization_id', config.organization_id)
      .maybeSingle();

    if (data) return data;
  }

  const { data: projects } = await client
    .from('projects')
    .select('id, name')
    .eq('organization_id', config.organization_id)
    .order('id', { ascending: true })
    .limit(1);

  return projects?.[0] || null;
}

module.exports = {
  listProjects,
  getReportProject
};
