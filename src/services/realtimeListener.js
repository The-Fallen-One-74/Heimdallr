const { createClient } = require('@supabase/supabase-js');
const { sendNotificationWithRetry } = require('./notificationService');

/**
 * Initialize Realtime listener for team_events table
 * Listens for new events and triggers Discord notifications
 * @param {Discord.Client} discordClient - Discord bot client
 */
function initRealtimeListener(discordClient) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials for Realtime listener');
    return null;
  }

  console.log('🔔 Initializing Realtime listener for team_events...');

  // Create Supabase client for Realtime
  const supabase = createClient(supabaseUrl, supabaseKey, {
    realtime: {
      params: {
        eventsPerSecond: 10
      }
    }
  });

  // Subscribe to INSERT events on team_events table
  const channel = supabase
    .channel('team_events_changes')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'team_events'
      },
      async (payload) => {
        console.log('📬 New team event received:', payload.new);
        
        const event = payload.new;
        
        // Skip if no Discord guild configured
        if (!event.discord_guild_id) {
          console.log('⏭️  Skipping event without discord_guild_id');
          return;
        }

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
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('✅ Realtime listener subscribed successfully');
      } else if (status === 'CHANNEL_ERROR') {
        console.error('❌ Realtime channel error');
      } else if (status === 'TIMED_OUT') {
        console.error('⏱️  Realtime subscription timed out');
      } else if (status === 'CLOSED') {
        console.log('🔕 Realtime channel closed');
      }
    });

  // Return cleanup function
  return () => {
    console.log('🔕 Cleaning up Realtime listener...');
    supabase.removeChannel(channel);
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
