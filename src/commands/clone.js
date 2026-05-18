const { SlashCommandBuilder, PermissionFlagsBits, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const Embed = require('../utils/EmbedBuilder');
const RateLimiter = require('../utils/RateLimiter');
const Validator = require('../utils/Validator');
const Security = require('../security/SecurityManager');
const ServerCloner = require('../systems/ServerCloner');
const BackupSystem = require('../systems/BackupSystem');
const QueueSystem = require('../systems/QueueSystem');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clone')
    .setDescription('Clone a Discord server structure to this server')
    .addStringOption(opt =>
      opt.setName('source')
        .setDescription('Server invite link (discord.gg/xxx) or server ID')
        .setRequired(true)
    )
    .addBooleanOption(opt =>
      opt.setName('backup')
        .setDescription('Create a backup of current server before cloning (recommended)')
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

    const rateCheck = await RateLimiter.consume('clone', user.id);
    if (!rateCheck.allowed) {
      return interaction.reply({ embeds: [Embed.warning('Cooldown Active', rateCheck.message)], ephemeral: true });
    }

    const sourceInput = interaction.options.getString('source');
    const makeBackup = interaction.options.getBoolean('backup') ?? true;

    const validation = Validator.validateServerTarget(sourceInput);
    if (!validation.valid) {
      return interaction.reply({ embeds: [Embed.error('Invalid Input', validation.error)], ephemeral: true });
    }

    await interaction.deferReply();

    let sourceGuild;
    try {
      if (validation.type === 'id') {
        sourceGuild = client.guilds.cache.get(validation.value);
        if (!sourceGuild) {
          try {
            sourceGuild = await client.guilds.fetch(validation.value);
          } catch {
            sourceGuild = null;
          }
        }
      } else {
        try {
          const invite = await client.fetchInvite(validation.value);
          if (invite.guild) {
            sourceGuild = client.guilds.cache.get(invite.guild.id);
            if (!sourceGuild) sourceGuild = await client.guilds.fetch(invite.guild.id).catch(() => null);
          }
        } catch {
          sourceGuild = null;
        }
      }
    } catch {
      sourceGuild = null;
    }

    if (!sourceGuild) {
      return interaction.editReply({
        embeds: [Embed.error('Server Not Found',
          'Could not access that server. The bot must be a member of the source server to clone it.\n\n' +
          '**Note:** You can only clone servers the bot has joined.'
        )],
      });
    }

    if (sourceGuild.id === guild.id) {
      return interaction.editReply({ embeds: [Embed.error('Invalid Source', 'You cannot clone a server into itself.')] });
    }

    const confirmEmbed = Embed.warning(
      'Confirm Server Clone',
      `You are about to **completely overwrite** this server with the structure of **${sourceGuild.name}**.\n\n` +
      `⚠️ This will:\n` +
      `• Delete ALL existing channels and roles\n` +
      `• Replace them with the source server's structure\n\n` +
      `**Source:** ${sourceGuild.name} (${sourceGuild.memberCount.toLocaleString()} members)\n` +
      `**Target:** ${guild.name}\n\n` +
      `${makeBackup ? '✅ A backup will be created before cloning.' : '❌ No backup will be created (risky!).'}\n\n` +
      `Are you sure you want to proceed?`
    );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('clone_confirm').setLabel('Yes, Clone It').setStyle(ButtonStyle.Danger).setEmoji('⚠️'),
      new ButtonBuilder().setCustomId('clone_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary).setEmoji('✖️')
    );

    await interaction.editReply({ embeds: [confirmEmbed], components: [row] });

    const filter = i => i.user.id === user.id && ['clone_confirm', 'clone_cancel'].includes(i.customId);
    let btnInteraction;
    try {
      btnInteraction = await interaction.channel.awaitMessageComponent({ filter, time: 30000 });
    } catch {
      await interaction.editReply({ embeds: [Embed.info('Timed Out', 'Clone confirmation expired.')], components: [] });
      return;
    }

    if (btnInteraction.customId === 'clone_cancel') {
      await btnInteraction.update({ embeds: [Embed.info('Cancelled', 'Server clone was cancelled.')], components: [] });
      return;
    }

    await btnInteraction.update({
      embeds: [Embed.cloneProgress('Analyzing', 'Starting clone process...', 1, 7)],
      components: [],
    });

    try {
      await QueueSystem.add('clone', async () => {
        if (makeBackup) {
          await interaction.editReply({ embeds: [Embed.loading('Creating Backup', 'Backing up current server before cloning...')] });
          await BackupSystem.createBackup(guild, user.id, { type: 'pre-clone' });
        }

        await ServerCloner.clone(sourceGuild, guild, {
          userId: user.id,
          onProgress: async (stage, message, current, total) => {
            try {
              await interaction.editReply({
                embeds: [Embed.cloneProgress(stage, message, current, total)],
              });
            } catch {}
          },
        });
      }, { userId: user.id, guildId: guild.id, jobId: `clone-${guild.id}-${Date.now()}` });

      await interaction.editReply({
        embeds: [Embed.success(
          'Server Cloned Successfully!',
          ServerCloner.formatResult(
            { rolesCreated: 0, channelsCreated: 0, categoriesCreated: 0, emojisCreated: 0, stickersCreated: 0, errors: [], duration: 0 },
            sourceGuild,
            guild
          )
        )],
      });
    } catch (err) {
      await interaction.editReply({
        embeds: [Embed.error(
          'Clone Failed',
          `The clone process encountered an error:\n\`${err.message}\`\n\n` +
          (makeBackup ? '✅ Your pre-clone backup is safe and can be restored.' : '')
        )],
      });
    }
  },
};
