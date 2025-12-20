// This file is kept for backwards compatibility but is no longer used
// Guild configurations are now stored in config/guilds.json
// Each guild connects directly to their own Bifröst Supabase instance

module.exports = {
  initSupabase: () => null,
  getSupabase: () => null,
  testConnection: async () => true
};
