const express = require('express');
const { checkAvailability, validateRequest } = require('../services/availability');
const logger = require('../utils/logger');

const router = express.Router();

// A direct, deterministic availability endpoint. The chat route can reach the
// same tool through natural language, but exposing it plainly lets the frontend's
// date/guest picker skip the LLM entirely — this is pure business logic, so there
// is no reason to route it through a model.
router.post('/availability', (req, res) => {
  const { checkIn, checkOut, adults } = req.body || {};
  const parsedAdults = typeof adults === 'string' ? parseInt(adults, 10) : adults;

  const problems = validateRequest({ checkIn, checkOut, adults: parsedAdults });
  if (problems.length > 0) {
    return res.status(400).json({
      error: 'invalid_request',
      message: `Please provide ${problems.join(', ')}.`,
      details: problems,
    });
  }

  const result = checkAvailability(checkIn, checkOut, parsedAdults);
  logger.info('availability endpoint', { checkIn, checkOut, adults: parsedAdults, anyAvailable: result.anyAvailable });
  return res.json(result);
});

module.exports = router;
