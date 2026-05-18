const { SlashCommandBuilder, PermissionFlagsBits, ButtonBuilder, ButtonStyle, ActionRowBuilder, ChannelType } = require('discord.js');
const Embed = require('../utils/EmbedBuilder');
const Security = require('../security/SecurityManager');
const BackupSystem = require('../systems/BackupSystem');
const QueueSystem = require('../systems/QueueSystem');
const { createContextLogger } = require('../utils/Logger');

const log = createContextLogger('RestoreCommand');
const SLEEP = ms => new Promise(r => setTimeout(r, ms));

module.exports = {
  data: new SlashCommandBuilder()
    .setName('restore')
    .setDescription('Restore a server backup to this server')
    .addStringOption(opt =>
      opt.setName('id').setDescription('Backup ID (use /backup list to see your backups)').setRequired(true)
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

    const inputId = interaction.options.getString('id');
    const backup = BackupSystem.getBackup(inputId);

    if (!backup || backup.createdBy !== user.id) {
      return interaction.reply({
        embeds: [Embed.error('Backup Not Found', 'No backup found with that ID, or you do not own it.\nUse `/backup list` to see your backups.')],
        ephemeral: true,
      });
    }

    const confirmEmbed = Embed.warning(
      'Confirm Restore',
      `You are about to restore backup **${backup.backupId.slice(0, 8)}...** from **${backup.guildName}**.\n\n` +
      `⚠️ This will overwrite ALL current channels and roles.\n\n` +
      `**Backup contains:**\n🎭 ${backup.metadata.totalRoles} roles\n📚 ${backup.metadata.totalChannels} channels\n😀 ${backup.metadata.totalEmojis} emojis\n\nProceed?`
    );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('restore_confirm').setLabel('Restore').setStyle(ButtonStyle.Danger).setEmoji('🔄'),
      new ButtonBuilder().setCustomId('restore_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary).setEmoji('✖️')
    );

    await interaction.reply({ embeds: [confirmEmbed], components: [row] });

    const filter = i => i.user.id === user.id && ['restore_confirm', 'restore_cancel'].includes(i.customId);
    let btn;
    try {
      btn = await interaction.channel.awaitMessageComponent({ filter, time: 30000 });
    } catch {
      return interaction.editReply({ embeds: [Embed.info('Timed Out', 'Restore confirmation expired.')], components: [] });
    }

    if (btn.customId === 'restore_cancel') {
      return btn.update({ embeds: [Embed.info('Cancelled', 'Restore was cancelled.')], components: [] });
    }

    await btn.update({ embeds: [Embed.loading('Restoring Backup', 'Starting restore process...')], components: [] });

    try {
      await QueueSystem.add('clone', async () => {
        await interaction.editReply({ embeds: [Embed.progress('Restoring', 1, 5, 'Clearing current server...')] });

        const chDel = guild.channels.cache.filter(c => c.deletable).map(c => c.delete().catch(() => {}));
        await Promise.allSettled(chDel);
        await SLEEP(400);

        const roleDel = guild.roles.cache
          .filter(r => r.editable && r.name !== '@everyone' && !r.managed)
          .map(r => r.delete().catch(() => {}));
        await Promise.allSettled(roleDel);
        await SLEEP(400);

        await interaction.editReply({ embeds: [Embed.progress('Restoring', 2, 5, `Creating ${backup.roles.length} roles...`)] });

        const roleMap = new Map();
        for (const roleData of [...backup.roles].sort((a, b) => a.position - b.position)) {
          try {
            const role = await guild.roles.create({
              name: roleData.name, color: roleData.color || 0, hoist: roleData.hoist,
              mentionable: roleData.mentionable, reason: 'Backup Restore',
            });
            roleMap.set(roleData.originalId, role.id);
            await SLEEP(100);
          } catch {}
        }

        await interaction.editReply({ embeds: [Embed.progress('Restoring', 3, 5, `Creating ${backup.categories.length} categories...`)] });

        for (const catData of [...backup.categories].sort((a, b) => (a.position || 0) - (b.position || 0))) {
          try {
            const cat = await guild.channels.create({ name: catData.name, type: ChannelType.GuildCategory, position: catData.position || 0, reason: 'Backup Restore' });
            await SLEEP(150);

            for (const chData of catData.channels || []) {
              try {
                await guild.channels.create({
                  name: chData.name, type: chData.type || ChannelType.GuildText, parent: cat.id,
                  topic: chData.topic || '', nsfw: chData.nsfw || false,
                  rateLimitPerUser: chData.rateLimitPerUser || 0, position: chData.position || 0, reason: 'Backup Restore',
                });
                await SLEEP(100);
              } catch {}
            }
          } catch {}
        }

        await interaction.editReply({ embeds: [Embed.progress('Restoring', 4, 5, 'Applying server settings...')] });

        try {
          const settings = { reason: 'Backup Restore' };
          if (backup.guild.name) settings.name = backup.guild.name;
          if (backup.guild.verificationLevel !== undefined) settings.verificationLevel = backup.guild.verificationLevel;
          if (backup.guild.description) settings.description = backup.guild.description;
          if (backup.guild.preferredLocale) settings.preferredLocale = backup.guild.preferredLocale;
          await guild.edit(settings);
        } catch {}

        await interaction.editReply({ embeds: [Embed.progress('Restoring', 5, 5, 'Finalizing...')] });
        await SLEEP(500);
      }, { userId: user.id, guildId: guild.id });

      await interaction.editReply({
        embeds: [Embed.success('Backup Restored!',
          `Successfully restored backup from **${backup.guildName}**.\n\n🎭 Roles: ${backup.metadata.totalRoles} • 📚 Channels: ${backup.metadata.totalChannels}`
        )],
      });
    } catch (err) {
      log.error('Restore failed', { error: err.message });
      await interaction.editReply({ embeds: [Embed.error('Restore Failed', err.message)] });
    }
  },
};
