const { Client, GatewayIntentBits, Partials, Options } = require('discord.js');
const config = require('./config');
const CommandHandler = require('./handlers/CommandHandler');
const EventHandler = require('./handlers/EventHandler');
const { createContextLogger } = require('./utils/Logger');

const log = createContextLogger('Client');

function createClient() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildEmojisAndStickers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildPresences,
    ],
    partials: [Partials.Guild, Partials.Channel, Partials.Message],
    makeCache: Options.cacheWithLimits({
      MessageManager: 50,
      PresenceManager: 0,
      GuildMemberManager: {
        maxSize: 200,
        keepOverLimit: member => member.id === member.client.user?.id,
      },
    }),
    sweepers: {
      ...Options.DefaultSweeperSettings,
      messages: { interval: 60, lifetime: 1800 },
      users: { interval: 3600, filter: () => user => !user.bot },
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

  process.on('SIGTERM', async () => {
    log.info('SIGTERM received, shutting down gracefully...');
    client.destroy();
    const { disconnect } = require('./database/connection');
    await disconnect();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    log.info('SIGINT received, shutting down gracefully...');
    client.destroy();
    const { disconnect } = require('./database/connection');
    await disconnect();
    process.exit(0);
  });

  return client;
}

module.exports = { createClient };
