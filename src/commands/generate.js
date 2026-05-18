const { SlashCommandBuilder, PermissionFlagsBits, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const Embed = require('../utils/EmbedBuilder');
const RateLimiter = require('../utils/RateLimiter');
const Validator = require('../utils/Validator');
const Security = require('../security/SecurityManager');
const AIServerGenerator = require('../systems/AIServerGenerator');
const BackupSystem = require('../systems/BackupSystem');
const QueueSystem = require('../systems/QueueSystem');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('generate')
    .setDescription('Use AI to generate a complete server structure from a text prompt')
    .addStringOption(opt =>
      opt.setName('prompt')
        .setDescription('Describe the server you want (e.g. "cyberpunk gaming community")')
        .setRequired(true)
        .setMaxLength(500)
    )
    .addBooleanOption(opt =>
      opt.setName('backup')
        .setDescription('Create a backup before generating (recommended)')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(client, interaction) {
    const { guild, user } = interaction;

    const userCheck = await Security.checkUser(user.id);
    if (!userCheck.allowed) {
      return interaction.reply({ embeds: [Embed.error('Access Denied', userCheck.reason)], ephemeral: true });
    }

    const botPerms = await Security.checkBotPermissions(guild, ['ManageGuild', 'ManageChannels', 'ManageRoles']);
    if (!botPerms.allowed) {
      return interaction.reply({ embeds: [Embed.error('Missing Permissions', botPerms.reason)], ephemeral: true });
    }

    const rateCheck = await RateLimiter.consume('generate', user.id);
    if (!rateCheck.allowed) {
      return interaction.reply({ embeds: [Embed.warning('Cooldown Active', rateCheck.message)], ephemeral: true });
    }

    const prompt = interaction.options.getString('prompt');
    const makeBackup = interaction.options.getBoolean('backup') ?? true;

    const promptValidation = Validator.isValidPrompt(prompt);
    if (!promptValidation.valid) {
      return interaction.reply({ embeds: [Embed.error('Invalid Prompt', promptValidation.error)], ephemeral: true });
    }

    const sanitizedPrompt = Security.sanitizeInput(prompt, { maxLength: 500 });

    const confirmEmbed = Embed.base({
      color: 0x9B59B6,
      title: '🤖 AI Server Generation',
      description:
        `**Prompt:** "${sanitizedPrompt}"\n\n` +
        `The AI will completely **redesign this server** based on your prompt.\n\n` +
        `⚠️ This will:\n` +
        `• Delete ALL existing channels and roles\n` +
        `• Generate a completely new structure using AI\n\n` +
        `${makeBackup ? '✅ A backup will be created first.' : '❌ No backup (risky!).'}\n\n` +
        `Proceed?`,
    });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('gen_confirm').setLabel('Generate Server').setStyle(ButtonStyle.Primary).setEmoji('🤖'),
      new ButtonBuilder().setCustomId('gen_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary).setEmoji('✖️')
    );

    await interaction.reply({ embeds: [confirmEmbed], components: [row], ephemeral: false });

    const filter = i => i.user.id === user.id && ['gen_confirm', 'gen_cancel'].includes(i.customId);
    let btnInteraction;
    try {
      btnInteraction = await interaction.channel.awaitMessageComponent({ filter, time: 30000 });
    } catch {
      await interaction.editReply({ embeds: [Embed.info('Timed Out', 'Generation confirmation expired.')], components: [] });
      return;
    }

    if (btnInteraction.customId === 'gen_cancel') {
      await btnInteraction.update({ embeds: [Embed.info('Cancelled', 'Server generation was cancelled.')], components: [] });
      return;
    }

    await btnInteraction.update({
      embeds: [Embed.generateProgress('Initializing', 'Starting AI server generation...')],
      components: [],
    });

    try {
      const result = await QueueSystem.add('generate', async () => {
        if (makeBackup) {
          await interaction.editReply({ embeds: [Embed.loading('Creating Backup', 'Backing up current server...')] });
          await BackupSystem.createBackup(guild, user.id, { type: 'pre-clone' });
        }

        return await AIServerGenerator.generate(guild, sanitizedPrompt, {
          userId: user.id,
          onProgress: async (stage, message) => {
            try {
              await interaction.editReply({ embeds: [Embed.generateProgress(stage, message)] });
            } catch {}
          },
        });
      }, { userId: user.id, guildId: guild.id, jobId: `generate-${guild.id}-${Date.now()}` });

      const resultEmbed = Embed.base({
        color: 0xF1C40F,
        title: '✨ Server Generated Successfully!',
        description: AIServerGenerator.formatResult(result),
      });
      resultEmbed.addFields(
        { name: '💡 Prompt', value: `"${sanitizedPrompt}"`, inline: false },
        { name: '🤖 AI Provider', value: result.provider, inline: true },
        { name: '⚡ Model', value: result.model, inline: true },
        { name: '⏱️ Time', value: `${(result.duration / 1000).toFixed(1)}s`, inline: true }
      );

      await interaction.editReply({ embeds: [resultEmbed] });

    } catch (err) {
      const isAIError = err.message.includes('AI providers');
      await interaction.editReply({
        embeds: [Embed.error(
          isAIError ? 'AI Unavailable' : 'Generation Failed',
          `${err.message}\n\n${makeBackup ? '✅ Your pre-generation backup is safe.' : ''}`
        )],
      });
    }
  },
};
