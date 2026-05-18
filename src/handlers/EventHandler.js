const fs = require('fs');
const path = require('path');
const { createContextLogger } = require('../utils/Logger');

const log = createContextLogger('EventHandler');

class EventHandler {
  constructor(client) {
    this.client = client;
    this.events = new Map();
  }

  async load() {
    const eventsDir = path.join(__dirname, '../events');

    if (!fs.existsSync(eventsDir)) {
      log.warn('Events directory not found');
      return;
    }

    const files = fs.readdirSync(eventsDir).filter(f => f.endsWith('.js'));

    for (const file of files) {
      try {
        const filePath = path.join(eventsDir, file);
        delete require.cache[require.resolve(filePath)];
        const event = require(filePath);

        if (!event.name || !event.execute) {
          log.warn(`Event file "${file}" missing name or execute`);
          continue;
        }

        const handler = (...args) => event.execute(this.client, ...args);

        if (event.once) {
          this.client.once(event.name, handler);
        } else {
          this.client.on(event.name, handler);
        }

        this.events.set(event.name, event);
        log.debug(`Registered event: ${event.name}`, { once: event.once || false });
      } catch (err) {
        log.error(`Failed to load event: ${file}`, { error: err.message });
      }
    }

    log.info(`Events registered`, { count: this.events.size });
  }
}

module.exports = EventHandler;
