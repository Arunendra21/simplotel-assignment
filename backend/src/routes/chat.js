const express = require('express');
const { respond } = require('../services/assistant');
const logger = require('../utils/logger');

const router = express.Router();

// Basic request validation. We keep it strict enough to catch obviously broken
// payloads but forgiving about optional fields (history, structured, context).
function validateChatBody(body) {
  const errors = [];
  if (typeof body !== 'object' || body === null) {
    return ['request body must be a JSON object'];
  }
  if (typeof body.message !== 'string' || body.message.trim() === '') {
    errors.push('"message" is required and must be a non-empty string');
  }
  if (body.message && body.message.length > 1000) {
    errors.push('"message" must be 1000 characters or fewer');
  }
  if (body.history !== undefined && !Array.isArray(body.history)) {
    errors.push('"history" must be an array of { role, content } messages');
  }
  if (body.structured !== undefined && (typeof body.structured !== 'object' || body.structured === null)) {
    errors.push('"structured" must be an object');
  }
  return errors;
}

router.post('/chat', async (req, res, next) => {
  const started = Date.now();
  const errors = validateChatBody(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'invalid_request', details: errors });
  }

  try {
    const result = await respond({
      message: req.body.message,
      history: req.body.history || [],
      structured: req.body.structured || {},
      context: req.body.context || {},
    });

    logger.info('chat handled', {
      intent: result.intent,
      type: result.type,
      ms: Date.now() - started,
    });

    return res.json(result);
  } catch (err) {
    // Hand off to the central error handler so the guest still gets a clean
    // fallback rather than a stack trace.
    return next(err);
  }
});

module.exports = router;
