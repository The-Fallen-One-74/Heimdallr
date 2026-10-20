const { getBifrostClient } = require('./bifrostClient');

// Where a new report starts on its board; Bifröst rejects anything else
const INITIAL_COLUMN = { bug: 'product-backlog', feature: 'submitted' };

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

/**
 * File a /bug or /feature report on the server's report board.
 * Servers linked with a code go through Bifröst's discord_submit_report,
 * which checks the connection. Servers linked by organization ID insert directly.
 * @param {Object} config - Guild configuration
 * @param {Object} report
 * @param {'bug'|'feature'} report.type
 * @param {string} report.title
 * @param {string} [report.description]
 * @param {string} report.priority - low, medium, high or critical
 * @param {string} [report.severity] - bugs only
 * @param {string} [report.steps] - bugs only
 * @param {string} report.reporterTag - Discord tag of the reporter
 * @returns {Promise<{ id: number }>}
 */
async function submitReport(config, report) {
  const client = getBifrostClient();
  if (!client) throw new Error('Database connection failed.');

  if (config.connection_id) {
    const { data, error } = await client.rpc('discord_submit_report', {
      p_connection_id: config.connection_id,
      p_type: report.type,
      p_title: report.title,
      p_description: report.description || null,
      p_priority: report.priority,
      p_severity: report.severity || null,
      p_steps: report.steps || null,
      p_reporter_tag: report.reporterTag
    });
    if (error) throw error;
    return { id: data.task_id };
  }

  const project = await getReportProject(config);
  if (!project) throw new Error('No projects found for this organization.');

  const { data: departments } = await client
    .from('departments')
    .select('id')
    .eq('organization_id', config.organization_id)
    .order('id', { ascending: true })
    .limit(1);

  const { data, error } = await client
    .from('tasks')
    .insert({
      title: report.title,
      description: report.description || null,
      type: report.type,
      priority: report.priority,
      severity: report.type === 'bug' ? report.severity : null,
      steps_to_reproduce: report.type === 'bug' ? report.steps : null,
      reported_by: report.reporterTag,
      column_id: INITIAL_COLUMN[report.type],
      project_id: project.id,
      department_id: departments?.[0]?.id || null,
      tags: ['discord']
    })
    .select('id')
    .single();

  if (error) throw error;
  return { id: data.id };
}

module.exports = {
  listProjects,
  getReportProject,
  submitReport
};
