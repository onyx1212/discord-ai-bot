require('dotenv').config();

const { REST, Routes } = require('@discordjs/rest');
const config = require('./config');
const CommandHandler = require('./handlers/CommandHandler');
const { logger } = require('./utils/Logger');

async function deploy() {
  try {
    config.validate();
  } catch (err) {
    logger.error('Config validation failed', { error: err.message });
    process.exit(1);
  }

  const handler = new CommandHandler(null);
  await handler.load();
  const commands = handler.getAllAsJSON();

  const rest = new REST({ version: '10' }).setToken(config.discord.token);

  const isGlobal = process.argv.includes('--global');
  const isDelete = process.argv.includes('--delete');

  if (isDelete) {
    logger.info('Deleting all commands...');
    if (isGlobal) {
      await rest.put(Routes.applicationCommands(config.discord.clientId), { body: [] });
      logger.info('Deleted all global commands');
    } else if (config.discord.guildId) {
      await rest.put(Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId), { body: [] });
      logger.info('Deleted all guild commands', { guildId: config.discord.guildId });
    }
    return;
  }

  if (isGlobal) {
    logger.info(`Deploying ${commands.length} commands globally...`);
    await rest.put(Routes.applicationCommands(config.discord.clientId), { body: commands });
    logger.info('Global commands deployed (may take up to 1 hour to propagate)');
  } else {
    if (!config.discord.guildId) {
      logger.error('DISCORD_GUILD_ID is required for guild deployment. Use --global for global deployment.');
      process.exit(1);
    }
    logger.info(`Deploying ${commands.length} commands to guild ${config.discord.guildId}...`);
    await rest.put(Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId), { body: commands });
    logger.info('Guild commands deployed (instant)');
  }

  commands.forEach(cmd => logger.info(`  ✓ /${cmd.name}`));
}

deploy().catch(err => {
  logger.error('Deploy failed', { error: err.message });
  process.exit(1);
});
