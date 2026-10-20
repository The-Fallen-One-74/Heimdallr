// What reporters hear when their /bug or /feature moves on the Bifröst board.
// Columns not listed here (backlog, submitted) stay quiet.
const STATUS_MESSAGES = {
  bug: {
    'sprint-backlog': { emoji: '📋', text: 'was picked up for a sprint' },
    done: { emoji: '✅', text: 'was fixed' }
  },
  feature: {
    'under-review': { emoji: '🔍', text: 'is under review' },
    approved: { emoji: '👍', text: 'was approved' },
    'in-progress': { emoji: '🛠️', text: 'is being built' },
    done: { emoji: '🚀', text: 'has shipped' },
    declined: { emoji: '❌', text: 'was declined' }
  }
};

/**
 * Describe a report's move between board columns
 * @param {'bug'|'feature'} type
 * @param {string|null} oldColumn
 * @param {string} newColumn
 * @returns {{ emoji: string, text: string }|null} null when nothing should be posted
 */
function describeStatusChange(type, oldColumn, newColumn) {
  if (!newColumn || oldColumn === newColumn) return null;
  return STATUS_MESSAGES[type]?.[newColumn] || null;
}

module.exports = {
  describeStatusChange
};
