const express = require('express');
const cors = require('cors');
const logger = require('../utils/logger');
const discordApi = require('./discordApi');

/**
 * Initialize Express API server for Heimdallr
 * Provides endpoints for desktop app to fetch Discord data
 */
function initApiServer(client) {
  const app = express();
  const PORT = process.env.API_PORT || 3001;
  const ALLOWED_ORIGIN = process.env.DESKTOP_APP_ORIGIN || 'http://localhost:5173';
  const API_KEY = process.env.API_KEY;

  // Middleware
  app.use(express.json());
  
  // CORS configuration - allow desktop app origin
  app.use(cors({
    origin: ALLOWED_ORIGIN,
    methods: ['GET', 'POST'],
    credentials: true
  }));

  // API Key authentication middleware
  const authenticateApiKey = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    
    if (!API_KEY) {
      // If no API key is configured, allow all requests (development mode)
      logger.warn('API_KEY not configured - running in development mode without authentication');
      return next();
    }
    
    if (!apiKey || apiKey !== API_KEY) {
      logger.warn(`Unauthorized API request from ${req.ip}`);
      return res.status(401).json({ error: 'Unauthorized - Invalid API key' });
    }
    
    next();
  };

  // Apply authentication to all API routes
  app.use('/api', authenticateApiKey);

  // Health check endpoint (no auth required)
  app.get('/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      bot: client.user ? client.user.tag : 'Not ready',
      guilds: client.guilds.cache.size,
      uptime: process.uptime()
    });
  });

  // Mount Discord API routes
  app.use('/api/discord', discordApi(client));

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
  });

  // Error handler
  app.use((err, req, res, next) => {
    logger.error('API Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  // Start server
  const server = app.listen(PORT, () => {
    logger.info(`Heimdallr API server listening on port ${PORT}`);
    logger.info(`CORS enabled for origin: ${ALLOWED_ORIGIN}`);
    logger.info(`API authentication: ${API_KEY ? 'enabled' : 'disabled (development mode)'}`);
  });

  // Graceful shutdown
  const shutdown = () => {
    logger.info('Shutting down API server...');
    server.close(() => {
      logger.info('API server closed');
    });
  };

  return { server, shutdown };
}

module.exports = { initApiServer };
