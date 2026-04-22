const express = require('express');
const logger = require('../utils/logger');
const { sendEventNotification } = require('../services/notificationService');

/**
 * Webhook routes for receiving Supabase database events
 */
function createWebhookRouter(client) {
  const router = express.Router();
  const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

  // Webhook authentication
  const authenticateWebhook = (req, res, next) => {
    const secret = req.headers['x-webhook-secret'];

    if (!WEBHOOK_SECRET) {
      logger.warn('WEBHOOK_SECRET not configured — webhooks disabled');
      return res.status(503).json({ error: 'Webhooks not configured' });
    }

    const cleanSecret = secret ? secret.trim().replace(/^:\s*/, '') : '';

    if (!cleanSecret || cleanSecret !== WEBHOOK_SECRET) {
      logger.warn(`Unauthorized webhook from ${req.ip}`);
      return res.status(401).json({ error: 'Unauthorized' });
    }

    next();
  };

  /**
   * POST /api/webhooks/calendar-events
   * Receives calendar_events INSERT notifications from Supabase
   */
  router.post('/calendar-events', authenticateWebhook, async (req, res) => {
    try {
      logger.info('📬 Received calendar-events webhook');

      const { type, table, record } = req.body;

      if (type !== 'INSERT' || table !== 'calendar_events') {
        logger.warn(`Unexpected webhook: ${type} on ${table}`);
        return res.status(400).json({ error: 'Invalid webhook type' });
      }

      if (!record) {
        return res.status(400).json({ error: 'Missing record data' });
      }

      const event = record;
      logger.info(`📅 New calendar event: "${event.title}" (org: ${event.organization_id})`);

      if (!event.organization_id) {
        logger.info('⏭️ Skipping event without organization_id');
        return res.json({ status: 'skipped', reason: 'no organization_id' });
      }

      // Respond immediately
      res.json({ status: 'processing', event_id: event.id });

      // Send notification asynchronously
      sendEventNotification(client, event, 'new')
        .then((messages) => {
          logger.info(`✅ Sent ${messages.length} notification(s) for event "${event.title}"`);
        })
        .catch((error) => {
          logger.error(`❌ Failed to notify for event "${event.title}":`, error);
        });

    } catch (error) {
      logger.error('❌ Webhook error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Keep old endpoint as alias for backward compatibility
  router.post('/team-events', authenticateWebhook, (req, res) => {
    logger.info('📬 Received team-events webhook (legacy endpoint)');
    // Forward to calendar-events handler
    req.url = '/calendar-events';
    router.handle(req, res);
  });

  return router;
}

module.exports = createWebhookRouter;
