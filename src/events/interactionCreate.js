const { InteractionType } = require('discord.js');
const Embed = require('../utils/EmbedBuilder');
const Security = require('../security/SecurityManager');
const RateLimiter = require('../utils/RateLimiter');
const { createContextLogger } = require('../utils/Logger');
const Log = require('../database/models/Log');

const log = createContextLogger('InteractionCreate');

module.exports = {
  name: 'interactionCreate',
  once: false,

  async execute(client, interaction) {
    if (interaction.type !== InteractionType.ApplicationCommand) return;

    const command = client.commandHandler.get(interaction.commandName);
    if (!command) {
      log.warn('Unknown command received', { command: interaction.commandName, userId: interaction.user.id });
      if (interaction.isRepliable()) {
        await interaction.reply({ embeds: [Embed.error('Unknown Command', 'This command does not exist.')], ephemeral: true });
      }
      return;
    }

    const { user, guild } = interaction;
    const start = Date.now();

    try {
      const userCheck = await Security.checkUser(user.id);
      if (!userCheck.allowed) {
        return interaction.reply({ embeds: [Embed.error('Access Denied', userCheck.reason)], ephemeral: true });
      }

      const globalCheck = await RateLimiter.consume('global', user.id);
      if (!globalCheck.allowed) {
        return interaction.reply({ embeds: [Embed.warning('Slow Down', globalCheck.message)], ephemeral: true });
      }

      log.info('Command executing', {
        command: interaction.commandName,
        userId: user.id,
        username: user.username,
        guildId: guild?.id,
        guildName: guild?.name,
      });

      await command.execute(client, interaction);

      const duration = Date.now() - start;
      log.info('Command completed', { command: interaction.commandName, userId: user.id, duration });

      await Log.logEvent({
        level: 'info',
        event: 'command_executed',
        guildId: guild?.id,
        userId: user.id,
        commandName: interaction.commandName,
        success: true,
        duration,
      });

    } catch (err) {
      const duration = Date.now() - start;

      log.error('Command execution failed', {
        command: interaction.commandName,
        userId: user.id,
        guildId: guild?.id,
        error: err.message,
        stack: err.stack,
        duration,
      });

      Security.flagSuspicious(user.id, 5, 'command_error');

      await Log.logEvent({
        level: 'error',
        event: 'command_failed',
        guildId: guild?.id,
        userId: user.id,
        commandName: interaction.commandName,
        error: { message: Security.maskToken(Security.maskApiKey(err.message)), stack: err.stack, code: err.code },
        success: false,
        duration,
      });

      const safeMessage = Security.maskToken(Security.maskApiKey(err.message));
      const errorEmbed = Embed.error(
        'An Error Occurred',
        `Something went wrong while running this command.\n\n\`${safeMessage}\`\n\nIf this keeps happening, please contact support.`
      );

      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ embeds: [errorEmbed] });
        } else {
          await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
      } catch (replyErr) {
        log.error('Failed to send error response', { error: replyErr.message });
      }
    }
  },
};
