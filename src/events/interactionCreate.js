const { InteractionType } = require('discord.js');
const Embed = require('../utils/EmbedBuilder');
const Security = require('../security/SecurityManager');
const RateLimiter = require('../utils/RateLimiter');
const { createContextLogger } = require('../utils/Logger');

const log = createContextLogger('InteractionCreate');

module.exports = {
  name: 'interactionCreate',
  once: false,

  async execute(client, interaction) {
    if (interaction.type !== InteractionType.ApplicationCommand) return;

    const command = client.commandHandler.get(interaction.commandName);
    if (!command) {
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
      });

      await command.execute(client, interaction);

      log.info('Command completed', {
        command: interaction.commandName,
        userId: user.id,
        duration: Date.now() - start,
      });

    } catch (err) {
      log.error('Command execution failed', {
        command: interaction.commandName,
        userId: user.id,
        error: err.message,
        stack: err.stack,
        duration: Date.now() - start,
      });

      Security.flagSuspicious(user.id, 5, 'command_error');

      const safeMessage = Security.maskToken(Security.maskApiKey(err.message));
      const errorEmbed = Embed.error('An Error Occurred', `Something went wrong.\n\n\`${safeMessage}\`\n\nIf this persists, please contact support.`);

      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ embeds: [errorEmbed] });
        } else {
          await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
      } catch {}
    }
  },
};
