const { createContextLogger } = require('../utils/Logger');
const Embed = require('../utils/EmbedBuilder');
const config = require('../config');

const log = createContextLogger('GuildCreate');

module.exports = {
  name: 'guildCreate',
  once: false,

  async execute(client, guild) {
    log.info('Bot joined new guild', {
      guildId: guild.id,
      guildName: guild.name,
      memberCount: guild.memberCount,
    });

    try {
      const systemChannel = guild.systemChannel;
      if (!systemChannel) return;
      const canSend = systemChannel.permissionsFor(guild.members.me)?.has('SendMessages');
      if (!canSend) return;

      const embed = Embed.base({
        color: config.colors.primary,
        title: '👋 Thanks for adding Discord AI Bot!',
        description:
          '**Enterprise server management powered by AI.**\n\n' +
          '🔄 **`/clone`** — Clone any Discord server structure\n' +
          '✨ **`/generate`** — Generate a server with AI from a text prompt\n' +
          '📦 **`/backup`** — Create and manage server backups\n' +
          '🔄 **`/restore`** — Restore any backup\n' +
          '📊 **`/stats`** — View bot and AI statistics\n' +
          '📖 **`/help`** — Full command reference\n\n' +
          '*All commands require Administrator permission.*',
      });

      await systemChannel.send({ embeds: [embed] });
    } catch (err) {
      log.warn('Could not send welcome message', { guildId: guild.id, error: err.message });
    }
  },
};
