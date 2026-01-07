const { createClient } = require('@supabase/supabase-js');
const { sendNotificationWithRetry } = require('./notificationService');
const { getGuildConfig, getAllGuildConfigs } = require('./configManager');

/**
 * Initialize Realtime listener for team_events table
 * Listens for new events and triggers Discord notifications
 * @param {Discord.Client} discordClient - Discord bot client
 */
function initRealtimeListener(discordClient) {
  console.log('🔔 Initializing Realtime listeners for all configured guilds...');
  
  const guildConfigs = getAllGuildConfigs();
  console.log(`📋 Found ${Object.keys(guildConfigs).length} configured guild(s):`, Object.keys(guildConfigs));
  const cleanupFunctions = [];
  
  for (const [guildId, config] of Object.entries(guildConfigs)) {
    console.log(`🔍 Processing guild ${guildId}...`);
    if (!config.supabase_url || !config.supabase_key) {
      console.warn(`⚠️  Guild ${guildId} missing Supabase credentials, skipping Realtime listener`);
      continue;
    }
    
    console.log(`🔔 Setting up Realtime listener for guild ${guildId}...`);
    
    // Create Supabase client for this guild
    const supabase = createClient(config.supabase_url, config.supabase_key, {
      realtime: {
        params: {
          eventsPerSecond: 10
        }
      }
    });

    // Subscribe to INSERT events on team_events table for this guild
    const channel = supabase
      .channel(`team_events_${guildId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'team_events',
          filter: `discord_guild_id=eq.${guildId}`
        },
        async (payload) => {
          console.log(`📬 New team event received for guild ${guildId}:`, payload.new);
          
          const event = payload.new;
          
          // Skip if not the first occurrence of a recurring event
          if (event.is_recurring && event.recurring_event_id !== event.id) {
            console.log('⏭️  Skipping non-first occurrence of recurring event');
            return;
          }

          // Skip if already notified
          if (event.notified_at) {
            console.log('⏭️  Skipping already-notified event');
            return;
          }

          // Handle the new event
          try {
            await handleNewEvent(discordClient, event);
          } catch (error) {
            console.error('❌ Error handling new event:', error);
          }
        }
      )
      .subscribe((status, err) => {
        console.log(`🔔 Realtime subscription status for guild ${guildId}: ${status}`);
        if (err) {
          console.error(`❌ Realtime subscription error for guild ${guildId}:`, err);
        }
        if (status === 'SUBSCRIBED') {
          console.log(`✅ Realtime listener subscribed for guild ${guildId}`);
        } else if (status === 'CHANNEL_ERROR') {
          console.error(`❌ Realtime channel error for guild ${guildId}`);
        } else if (status === 'TIMED_OUT') {
          console.error(`⏱️  Realtime subscription timed out for guild ${guildId}`);
        } else if (status === 'CLOSED') {
          console.log(`🔕 Realtime channel closed for guild ${guildId}`);
        }
      });

    // Store cleanup function
    cleanupFunctions.push(() => {
      console.log(`🔕 Cleaning up Realtime listener for guild ${guildId}...`);
      supabase.removeChannel(channel);
    });
  }

  // Return cleanup function that cleans up all channels
  return () => {
    console.log('🔕 Cleaning up all Realtime listeners...');
    cleanupFunctions.forEach(cleanup => cleanup());
  };
}

/**
 * Handle a new event by sending Discord notification
 * @param {Discord.Client} discordClient - Discord bot client
 * @param {Object} event - Team event object from database
 */
async function handleNewEvent(discordClient, event) {
  console.log(`📅 Processing new event: ${event.title} (${event.id})`);
  
  const guildId = event.discord_guild_id;
  
  // Verify guild exists
  const guild = discordClient.guilds.cache.get(guildId);
  if (!guild) {
    console.error(`❌ Guild not found: ${guildId}`);
    return;
  }

  console.log(`✅ Found guild: ${guild.name}`);
  
  // Send notification with retry logic
  try {
    const message = await sendNotificationWithRetry(discordClient, guildId, event);
    if (message) {
      console.log(`✅ Successfully sent notification for event ${event.id}`);
    }
  } catch (error) {
    console.error(`❌ Failed to send notification for event ${event.id} after all retries:`, error);
  }
}

module.exports = {
  initRealtimeListener,
  handleNewEvent
};
