const fs = require('fs');
const path = require('path');
const logger = require('./logger');

// Where the bot keeps its local state. Tests point this at a temp folder.
const STATE_DIR = process.env.HEIMDALLR_STATE_DIR || path.join(__dirname, '../../config');

/**
 * A Map persisted as a JSON object under the state folder
 * @param {string} fileName - e.g. 'signups.json'
 * @param {Object} [options]
 * @param {number} [options.maxAgeDays] - Drop entries whose `updatedAt` is older than this on load
 * @returns {{ map: Map, save: Function }}
 */
function createJsonStore(fileName, { maxAgeDays } = {}) {
  const file = path.join(STATE_DIR, fileName);
  const map = new Map();

  try {
    if (fs.existsSync(file)) {
      for (const [key, value] of Object.entries(JSON.parse(fs.readFileSync(file, 'utf8')))) {
        map.set(key, value);
      }
    }
    if (maxAgeDays) {
      const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
      for (const [key, value] of map) {
        if (value?.updatedAt && new Date(value.updatedAt).getTime() < cutoff) map.delete(key);
      }
    }
  } catch (error) {
    logger.error(`Failed to load ${fileName}:`, error);
  }

  function save() {
    try {
      fs.mkdirSync(STATE_DIR, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(Object.fromEntries(map), null, 2));
    } catch (error) {
      logger.error(`Failed to save ${fileName}:`, error);
    }
  }

  return { map, save };
}

module.exports = {
  STATE_DIR,
  createJsonStore
};
