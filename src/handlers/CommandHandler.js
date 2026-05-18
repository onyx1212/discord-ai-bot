const fs = require('fs');
const path = require('path');
const { createContextLogger } = require('../utils/Logger');

const log = createContextLogger('CommandHandler');

class CommandHandler {
  constructor(client) {
    this.client = client;
    this.commands = new Map();
    this.cooldowns = new Map();
  }

  async load() {
    const commandsDir = path.join(__dirname, '../commands');

    if (!fs.existsSync(commandsDir)) {
      log.warn('Commands directory not found');
      return;
    }

    const files = fs.readdirSync(commandsDir).filter(f => f.endsWith('.js'));

    for (const file of files) {
      try {
        const filePath = path.join(commandsDir, file);
        delete require.cache[require.resolve(filePath)];
        const command = require(filePath);

        if (!command.data || !command.execute) {
          log.warn(`Command file "${file}" missing data or execute`, { file });
          continue;
        }

        this.commands.set(command.data.name, command);
        log.debug(`Loaded command: ${command.data.name}`);
      } catch (err) {
        log.error(`Failed to load command: ${file}`, { error: err.message, stack: err.stack });
      }
    }

    log.info(`Commands loaded`, { count: this.commands.size });
    return this.commands;
  }

  get(name) {
    return this.commands.get(name);
  }

  getAll() {
    return [...this.commands.values()];
  }

  getAllAsJSON() {
    return [...this.commands.values()].map(cmd => cmd.data.toJSON());
  }

  checkCooldown(userId, commandName, cooldownSeconds) {
    const key = `${userId}:${commandName}`;
    const now = Date.now();

    if (this.cooldowns.has(key)) {
      const expiresAt = this.cooldowns.get(key);
      if (now < expiresAt) {
        const remaining = Math.ceil((expiresAt - now) / 1000);
        return { onCooldown: true, remaining };
      }
    }

    this.cooldowns.set(key, now + cooldownSeconds * 1000);
    setTimeout(() => this.cooldowns.delete(key), cooldownSeconds * 1000);

    return { onCooldown: false };
  }
}

module.exports = CommandHandler;
