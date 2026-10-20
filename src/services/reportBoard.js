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
 * File a /bug or /feature report on the server's report board through
 * Bifröst's discord_submit_report, which checks the server's connection.
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

module.exports = {
  listProjects,
  submitReport
};
