const { createContextLogger } = require('../utils/Logger');

const log = createContextLogger('GuildDelete');

module.exports = {
  name: 'guildDelete',
  once: false,

  async execute(client, guild) {
    log.info('Bot removed from guild', {
      guildId: guild.id,
      guildName: guild.name,
    });
  },
};
