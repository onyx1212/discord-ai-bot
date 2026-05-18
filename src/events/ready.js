const { ActivityType } = require('discord.js');
const { createContextLogger } = require('../utils/Logger');
const AIManager = require('../ai/AIManager');
const config = require('../config');

const log = createContextLogger('Ready');

const ACTIVITIES = [
  { name: 'Cloning servers', type: ActivityType.Watching },
  { name: 'AI generating...', type: ActivityType.Playing },
  { name: '/help for commands', type: ActivityType.Listening },
  { name: 'your server structure', type: ActivityType.Watching },
  { name: 'OpenRouter AI', type: ActivityType.Playing },
];

module.exports = {
  name: 'ready',
  once: true,

  async execute(client) {
    log.info('Bot is online', {
      tag: client.user.tag,
      id: client.user.id,
      guilds: client.guilds.cache.size,
    });

    const health = await AIManager.healthCheck();
    log.info('AI provider health check', health);

    let activityIndex = 0;
    const setActivity = () => {
      const a = ACTIVITIES[activityIndex % ACTIVITIES.length];
      client.user.setActivity(a.name, { type: a.type });
      activityIndex++;
    };
    setActivity();
    setInterval(setActivity, 30000);
    client.user.setStatus('online');

    log.info('Bot fully initialized', {
      guilds: client.guilds.cache.size,
      users: client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0),
      openrouter: health.openrouter ? 'online' : 'offline',
      groq: health.groq ? 'online' : 'offline',
    });

    if (config.isDev) log.info('Running in development mode');
  },
};
