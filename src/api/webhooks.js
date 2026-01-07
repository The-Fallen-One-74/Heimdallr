const express = require('express');
const logger = require('../utils/logger');
const { sendNotificationWithRetry } = require('../services/notificationService');

/**
 * Webhook routes for receiving Supabase database events
 */
function createWebhookRouter(client) {
  const router = express.Router();
  const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

  // Webhook authentication middleware
  const authenticateWebhook = (req, res, next) => {
    const secret = req.headers['x-webhook-secret'];
    
    if (!WEBHOOK_SECRET) {
      logger.warn('WEBHOOK_SECRET not configured - webhooks disabled');
      return res.status(503).json({ error: 'Webhooks not configured' });
    }
    
    // Trim whitespace and remove any leading colons (Supabase may add these)
    const cleanSecret = secret ? secret.trim().replace(/^:\s*/, '') : '';
    
    if (!cleanSecret || cleanSecret !== WEBHOOK_SECRET) {
      logger.warn(`Unauthorized webhook request from ${req.ip}`);
      logger.warn(`Expected: "${WEBHOOK_SECRET}"`);
      logger.warn(`Received: "${secret}" -> Cleaned: "${cleanSecret}"`);
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    logger.info('✅ Webhook authenticated successfully');
    next();
  };

  /**
   * POST /api/webhooks/team-events
   * Receives team_events INSERT notifications from Supabase
   */
  router.post('/team-events', authenticateWebhook, async (req, res) => {
    try {
      logger.info('📬 Received team_events webhook');
      
      const { type, table, record, old_record } = req.body;
      
      // Validate webhook payload
      if (type !== 'INSERT' || table !== 'team_events') {
        logger.warn(`Unexpected webhook type: ${type} for table: ${table}`);
        return res.status(400).json({ error: 'Invalid webhook type' });
      }
      
      if (!record) {
        logger.warn('Webhook payload missing record data');
        return res.status(400).json({ error: 'Missing record data' });
      }
      
      const event = record;
      logger.info(`📬 New team event: ${event.title} (${event.id})`);
      
      // Skip if not the first occurrence of a recurring event
      if (event.is_recurring && event.recurring_event_id !== event.id) {
        logger.info('⏭️  Skipping non-first occurrence of recurring event');
        return res.json({ status: 'skipped', reason: 'non-first occurrence' });
      }

      // Skip if already notified
      if (event.notified_at) {
        logger.info('⏭️  Skipping already-notified event');
        return res.json({ status: 'skipped', reason: 'already notified' });
      }

      // Skip if no Discord guild ID
      if (!event.discord_guild_id) {
        logger.info('⏭️  Skipping event without Discord guild ID');
        return res.json({ status: 'skipped', reason: 'no discord_guild_id' });
      }

      // Send Discord notification
      try {
        await sendNotificationWithRetry(client, event);
        logger.info(`✅ Successfully sent notification for event ${event.id}`);
        res.json({ status: 'success', event_id: event.id });
      } catch (error) {
        logger.error(`❌ Failed to send notification for event ${event.id}:`, error);
        res.status(500).json({ error: 'Failed to send notification', event_id: event.id });
      }
      
    } catch (error) {
      logger.error('❌ Error processing webhook:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

module.exports = createWebhookRouter;
