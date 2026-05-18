require('dotenv').config();

const config = require('./config');
const { createClient } = require('./client');
const { logger } = require('./utils/Logger');

async function bootstrap() {
  logger.info('Starting Discord AI Bot...', {
    environment: config.environment,
    nodeVersion: process.version,
  });

  try {
    config.validate();
  } catch (err) {
    logger.error('Configuration validation failed', { error: err.message });
    process.exit(1);
  }

  const client = createClient();

  await client.commandHandler.load();
  await client.eventHandler.load();

  logger.info('Connecting to Discord...');
  await client.login(config.discord.token);
}

bootstrap().catch(err => {
  logger.error('Fatal bootstrap error', { error: err.message, stack: err.stack });
  process.exit(1);
});
