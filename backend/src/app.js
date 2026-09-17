// The Express app, split out from the server so tests can import it with
// supertest without opening a real port.

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const chatRouter = require('./routes/chat');
const availabilityRouter = require('./routes/availability');
const hotel = require('./data/hotel.json');
const logger = require('./utils/logger');
const llm = require('./llm/provider');

function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '32kb' }));

  // Lightweight request log. Skipped for the health check to avoid noise.
  app.use((req, _res, next) => {
    if (req.path !== '/api/health') {
      logger.debug('request', { method: req.method, path: req.path });
    }
    next();
  });

  // Health/status — handy for the frontend to show whether the LLM is wired up.
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      hotel: hotel.property.name,
      llmEnabled: llm.isEnabled(),
      provider: llm.provider(),
      time: new Date().toISOString(),
    });
  });

  app.use('/api', chatRouter);
  app.use('/api', availabilityRouter);

  // 404 for anything unmatched under the API — keep API errors as JSON.
  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'not_found', path: req.path });
  });

  // In a deployed single-service setup the backend also serves the built
  // frontend. During local dev the frontend runs on its own Vite server and
  // this dist folder simply doesn't exist, so the block is skipped.
  const clientDist = path.resolve(__dirname, '../../frontend/dist');
  if (fs.existsSync(path.join(clientDist, 'index.html'))) {
    app.use(express.static(clientDist));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  // Central error handler. Any thrown error becomes a graceful 500 with a
  // guest-friendly fallback message, never a leaked stack trace.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    logger.error('unhandled error', { path: req.path, error: err.message });
    res.status(500).json({
      error: 'internal_error',
      reply: `Sorry, something went wrong on our side. Please try again in a moment, or call us on ${hotel.property.contact.phone}.`,
    });
  });

  return app;
}

module.exports = { createApp };
