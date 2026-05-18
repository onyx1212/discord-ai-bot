const { Client, GatewayIntentBits, Partials, Options } = require('discord.js');
const CommandHandler = require('./handlers/CommandHandler');
const EventHandler = require('./handlers/EventHandler');
const { createContextLogger } = require('./utils/Logger');

const log = createContextLogger('Client');

function createClient() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildEmojisAndStickers,
    ],
    partials: [Partials.Guild, Partials.Channel],
    makeCache: Options.cacheWithLimits({
      MessageManager: 50,
      PresenceManager: 0,
    }),
    sweepers: {
      ...Options.DefaultSweeperSettings,
      messages: { interval: 60, lifetime: 1800 },
    },
    rest: {
      timeout: 15000,
      retries: 3,
    },
  });

  client.commandHandler = new CommandHandler(client);
  client.eventHandler = new EventHandler(client);

  process.on('unhandledRejection', (err) => {
    log.error('Unhandled rejection', { error: err?.message, stack: err?.stack });
  });

  process.on('uncaughtException', (err) => {
    log.error('Uncaught exception', { error: err?.message, stack: err?.stack });
    setTimeout(() => process.exit(1), 1000);
  });

  process.on('SIGTERM', () => {
    log.info('SIGTERM received, shutting down gracefully...');
    client.destroy();
    process.exit(0);
  });

  process.on('SIGINT', () => {
    log.info('SIGINT received, shutting down gracefully...');
    client.destroy();
    process.exit(0);
  });

  return client;
}

module.exports = { createClient };
