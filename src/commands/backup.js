const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const Embed = require('../utils/EmbedBuilder');
const RateLimiter = require('../utils/RateLimiter');
const Security = require('../security/SecurityManager');
const BackupSystem = require('../systems/BackupSystem');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('backup')
    .setDescription('Create or manage server backups')
    .addSubcommand(sub =>
      sub.setName('create')
        .setDescription('Create a new backup of this server')
        .addStringOption(opt =>
          opt.setName('notes').setDescription('Optional notes for this backup').setRequired(false).setMaxLength(200)
        )
    )
    .addSubcommand(sub => sub.setName('list').setDescription('List your recent server backups'))
    .addSubcommand(sub =>
      sub.setName('info')
        .setDescription('Get detailed info about a specific backup')
        .addStringOption(opt => opt.setName('id').setDescription('Backup ID (first 8 characters)').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('delete')
        .setDescription('Delete a backup')
        .addStringOption(opt => opt.setName('id').setDescription('Backup ID to delete').setRequired(true))
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(client, interaction) {
    const { guild, user } = interaction;
    const sub = interaction.options.getSubcommand();

    const userCheck = await Security.checkUser(user.id);
    if (!userCheck.allowed) {
      return interaction.reply({ embeds: [Embed.error('Access Denied', userCheck.reason)], ephemeral: true });
    }

    if (sub === 'create') {
      const rateCheck = await RateLimiter.consume('backup', user.id);
      if (!rateCheck.allowed) {
        return interaction.reply({ embeds: [Embed.warning('Rate Limited', rateCheck.message)], ephemeral: true });
      }

      await interaction.deferReply();
      await interaction.editReply({ embeds: [Embed.loading('Creating Backup', 'Serializing server structure...')] });

      try {
        const notes = interaction.options.getString('notes') || '';
        const backup = await BackupSystem.createBackup(guild, user.id, { type: 'manual', notes });

        const embed = Embed.success('Backup Created', 'Your server backup has been saved successfully.');
        embed.addFields(
          { name: '🆔 Backup ID', value: `\`${backup.backupId}\``, inline: false },
          { name: '🎭 Roles', value: `${backup.metadata.totalRoles}`, inline: true },
          { name: '📚 Channels', value: `${backup.metadata.totalChannels}`, inline: true },
          { name: '😀 Emojis', value: `${backup.metadata.totalEmojis}`, inline: true }
        );
        if (notes) embed.addFields({ name: '📝 Notes', value: notes, inline: false });

        await interaction.editReply({ embeds: [embed] });
      } catch (err) {
        await interaction.editReply({ embeds: [Embed.error('Backup Failed', err.message)] });
      }

    } else if (sub === 'list') {
      await interaction.deferReply({ ephemeral: true });
      const backups = BackupSystem.getUserBackups(user.id, 10);

      if (backups.length === 0) {
        return interaction.editReply({ embeds: [Embed.info('No Backups', 'You have no saved backups. Create one with `/backup create`.')] });
      }

      const embed = Embed.base({
        color: 0x5865F2,
        title: '📦 Your Server Backups',
        description: backups.map((b, i) => {
          const ts = Math.floor(new Date(b.createdAt).getTime() / 1000);
          return `**${i + 1}.** \`${b.backupId.slice(0, 8)}...\` — **${b.guildName}**\n` +
            `> Type: ${b.type} | Channels: ${b.metadata.totalChannels} | Roles: ${b.metadata.totalRoles}\n` +
            `> Created: <t:${ts}:R>`;
        }).join('\n\n'),
      });
      embed.setFooter({ text: `${backups.length} backup(s) • Use /restore to restore one` });
      await interaction.editReply({ embeds: [embed] });

    } else if (sub === 'info') {
      await interaction.deferReply({ ephemeral: true });
      const inputId = interaction.options.getString('id');
      const backup = BackupSystem.getBackup(inputId);

      if (!backup || backup.createdBy !== user.id) {
        return interaction.editReply({ embeds: [Embed.error('Not Found', 'No backup found with that ID, or it does not belong to you.')] });
      }

      const ts = Math.floor(new Date(backup.createdAt).getTime() / 1000);
      const embed = Embed.base({ color: 0x5865F2, title: `📦 Backup: ${backup.guildName}` });
      embed.addFields(
        { name: '🆔 Full ID', value: `\`${backup.backupId}\``, inline: false },
        { name: '🏠 Server', value: backup.guildName, inline: true },
        { name: '📋 Type', value: backup.type, inline: true },
        { name: '📅 Created', value: `<t:${ts}:F>`, inline: false },
        { name: '🎭 Roles', value: `${backup.metadata.totalRoles}`, inline: true },
        { name: '📚 Channels', value: `${backup.metadata.totalChannels}`, inline: true },
        { name: '😀 Emojis', value: `${backup.metadata.totalEmojis}`, inline: true }
      );
      if (backup.notes) embed.addFields({ name: '📝 Notes', value: backup.notes, inline: false });
      await interaction.editReply({ embeds: [embed] });

    } else if (sub === 'delete') {
      await interaction.deferReply({ ephemeral: true });
      const inputId = interaction.options.getString('id');
      try {
        BackupSystem.deleteBackup(inputId, user.id);
        await interaction.editReply({ embeds: [Embed.success('Deleted', `Backup \`${inputId.slice(0, 8)}...\` has been deleted.`)] });
      } catch (err) {
        await interaction.editReply({ embeds: [Embed.error('Delete Failed', err.message)] });
      }
    }
  },
};
