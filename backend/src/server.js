// Server entry point. Kept deliberately thin: build the app, read the port, listen.
require('dotenv').config();

const { createApp } = require('./app');
const logger = require('./utils/logger');
const llm = require('./llm/provider');

const PORT = process.env.PORT || 4000;
const app = createApp();

app.listen(PORT, () => {
  logger.info('Seabreeze Harbour assistant API listening', {
    port: PORT,
    llmEnabled: llm.isEnabled(),
    provider: llm.provider() || 'none (deterministic mode)',
  });
});
