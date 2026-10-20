const express = require('express');
const logger = require('../utils/logger');
const { sendEventNotification } = require('../services/notificationService');
const { wasCreatedFromDiscord } = require('../services/eventManager');
const { postAnnouncement, postSprintChange } = require('../services/bifrostUpdates');
const { postReportStatus } = require('../services/reportPosts');

// How long to wait before announcing, so /schedule can claim its own events
const DISCORD_CLAIM_DELAY_MS = 5000;

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

      // Send notification asynchronously. Events created with /schedule are
      // already announced by the command itself, so skip those.
      new Promise(resolve => setTimeout(resolve, DISCORD_CLAIM_DELAY_MS))
        .then(() => {
          if (wasCreatedFromDiscord(event.id)) {
            logger.info(`⏭️ Event "${event.title}" was created from Discord — already announced`);
            return [];
          }
          return sendEventNotification(client, event, 'new');
        })
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

  /**
   * POST /api/webhooks/announcements
   * Receives announcements INSERT notifications from Supabase
   */
  router.post('/announcements', authenticateWebhook, (req, res) => {
    const { type, table, record } = req.body;

    if (type !== 'INSERT' || table !== 'announcements' || !record) {
      logger.warn(`Unexpected webhook: ${type} on ${table}`);
      return res.status(400).json({ error: 'Invalid webhook type' });
    }

    res.json({ status: 'processing', announcement_id: record.id });

    postAnnouncement(client, record)
      .then(messages => logger.info(`✅ Posted announcement "${record.title}" to ${messages.length} server(s)`))
      .catch(error => logger.error(`❌ Failed to post announcement "${record.title}":`, error));
  });

  /**
   * POST /api/webhooks/sprints
   * Receives sprints INSERT/UPDATE notifications from Supabase and posts
   * when a sprint starts or completes
   */
  router.post('/sprints', authenticateWebhook, (req, res) => {
    const { type, table, record, old_record: previous } = req.body;

    if (!['INSERT', 'UPDATE'].includes(type) || table !== 'sprints' || !record) {
      logger.warn(`Unexpected webhook: ${type} on ${table}`);
      return res.status(400).json({ error: 'Invalid webhook type' });
    }

    res.json({ status: 'processing', sprint_id: record.id });

    postSprintChange(client, record, previous || null)
      .then(messages => {
        if (messages.length > 0) logger.info(`✅ Posted sprint "${record.name}" (${record.status}) to ${messages.length} server(s)`);
      })
      .catch(error => logger.error(`❌ Failed to post sprint "${record.name}":`, error));
  });

  /**
   * POST /api/webhooks/tasks
   * Receives tasks UPDATE notifications and replies under /bug and /feature
   * posts when they change column
   */
  router.post('/tasks', authenticateWebhook, (req, res) => {
    const { type, table, record, old_record: previous } = req.body;

    if (type !== 'UPDATE' || table !== 'tasks' || !record) {
      logger.warn(`Unexpected webhook: ${type} on ${table}`);
      return res.status(400).json({ error: 'Invalid webhook type' });
    }

    res.json({ status: 'processing', task_id: record.id });

    postReportStatus(client, record, previous || null)
      .catch(error => logger.error(`❌ Failed to post status for task ${record.id}:`, error));
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
