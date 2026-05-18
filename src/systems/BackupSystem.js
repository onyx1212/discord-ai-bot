const { v4: uuidv4 } = require('uuid');
const ServerBackup = require('../database/models/ServerBackup');
const Guild = require('../database/models/Guild');
const { createContextLogger } = require('../utils/Logger');
const config = require('../config');

const log = createContextLogger('BackupSystem');

class BackupSystem {
  async createBackup(guild, userId, options = {}) {
    log.info('Creating server backup', { guildId: guild.id, userId });
    const start = Date.now();

    try {
      const roles = this._serializeRoles(guild);
      const { categories, channels } = this._serializeChannels(guild);
      const emojis = await this._serializeEmojis(guild);
      const stickers = this._serializeStickers(guild);

      const backupData = {
        backupId: uuidv4(),
        guildId: guild.id,
        guildName: guild.name,
        createdBy: userId,
        type: options.type || 'manual',

        guild: {
          name: guild.name,
          description: guild.description || '',
          icon: guild.iconURL({ dynamic: true, size: 4096 }) || null,
          banner: guild.bannerURL({ size: 4096 }) || null,
          splash: guild.splashURL({ size: 4096 }) || null,
          discoverySplash: guild.discoverySplashURL({ size: 4096 }) || null,
          verificationLevel: guild.verificationLevel,
          defaultMessageNotifications: guild.defaultMessageNotifications,
          explicitContentFilter: guild.explicitContentFilter,
          preferredLocale: guild.preferredLocale,
          afkChannelId: guild.afkChannelId,
          afkTimeout: guild.afkTimeout,
          systemChannelId: guild.systemChannelId,
          systemChannelFlags: guild.systemChannelFlags?.bitfield || 0,
          rulesChannelId: guild.rulesChannelId,
          publicUpdatesChannelId: guild.publicUpdatesChannelId,
          features: [...(guild.features || [])],
          premiumTier: guild.premiumTier,
          nsfwLevel: guild.nsfwLevel,
        },

        roles,
        categories,
        channels,
        emojis,
        stickers,

        metadata: {
          totalRoles: roles.length,
          totalChannels: channels.length + categories.reduce((acc, c) => acc + (c.channels?.length || 0), 0),
          totalEmojis: emojis.length,
          totalStickers: stickers.length,
          discordVersion: '14',
        },

        expiresAt: options.expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        isPublic: options.isPublic || false,
        notes: options.notes || '',
      };

      const backup = await ServerBackup.create(backupData);

      await Guild.findOneAndUpdate(
        { guildId: guild.id },
        { $inc: { 'stats.backupsCreated': 1 }, 'stats.lastActivity': new Date() },
        { upsert: true }
      );

      log.info('Backup created successfully', {
        backupId: backup.backupId,
        guildId: guild.id,
        duration: Date.now() - start,
        roles: roles.length,
        channels: backupData.metadata.totalChannels,
        emojis: emojis.length,
      });

      return backup;
    } catch (err) {
      log.error('Backup creation failed', { guildId: guild.id, error: err.message });
      throw err;
    }
  }

  _serializeRoles(guild) {
    return guild.roles.cache
      .filter(r => !r.managed && r.name !== '@everyone')
      .sort((a, b) => b.position - a.position)
      .map(role => ({
        originalId: role.id,
        name: role.name,
        color: role.color,
        hoist: role.hoist,
        mentionable: role.mentionable,
        permissions: role.permissions.bitfield.toString(),
        position: role.position,
        icon: role.iconURL() || null,
        unicodeEmoji: role.unicodeEmoji || null,
      }));
  }

  _serializeChannels(guild) {
    const categories = [];
    const orphanChannels = [];

    const sortedCategories = guild.channels.cache
      .filter(c => c.type === 4)
      .sort((a, b) => a.position - b.position);

    for (const category of sortedCategories.values()) {
      const children = guild.channels.cache
        .filter(c => c.parentId === category.id)
        .sort((a, b) => a.position - b.position);

      categories.push({
        originalId: category.id,
        name: category.name,
        position: category.position,
        permissionOverwrites: this._serializePermissions(category),
        channels: children.map(ch => this._serializeChannel(ch)),
      });
    }

    guild.channels.cache
      .filter(c => !c.parentId && c.type !== 4)
      .sort((a, b) => a.position - b.position)
      .forEach(ch => orphanChannels.push(this._serializeChannel(ch)));

    return { categories, channels: orphanChannels };
  }

  _serializeChannel(channel) {
    const base = {
      originalId: channel.id,
      name: channel.name,
      type: channel.type,
      position: channel.position,
      permissionOverwrites: this._serializePermissions(channel),
    };

    if (channel.topic) base.topic = channel.topic;
    if (channel.nsfw) base.nsfw = channel.nsfw;
    if (channel.rateLimitPerUser) base.rateLimitPerUser = channel.rateLimitPerUser;
    if (channel.bitrate) base.bitrate = channel.bitrate;
    if (channel.userLimit) base.userLimit = channel.userLimit;
    if (channel.defaultAutoArchiveDuration) base.defaultAutoArchiveDuration = channel.defaultAutoArchiveDuration;

    if (channel.availableTags?.length > 0) {
      base.availableTags = channel.availableTags.map(t => ({
        name: t.name,
        emoji: t.emoji?.name || null,
        moderated: t.moderated,
      }));
    }

    return base;
  }

  _serializePermissions(channel) {
    if (!channel.permissionOverwrites?.cache) return [];
    return channel.permissionOverwrites.cache.map(ow => ({
      id: ow.id,
      type: ow.type,
      allow: ow.allow.bitfield.toString(),
      deny: ow.deny.bitfield.toString(),
    }));
  }

  async _serializeEmojis(guild) {
    return guild.emojis.cache.map(emoji => ({
      originalId: emoji.id,
      name: emoji.name,
      imageURL: emoji.imageURL({ size: 256 }),
      animated: emoji.animated,
      roles: emoji.roles?.cache?.map(r => r.id) || [],
    }));
  }

  _serializeStickers(guild) {
    return guild.stickers.cache.map(sticker => ({
      originalId: sticker.id,
      name: sticker.name,
      description: sticker.description || '',
      tags: sticker.tags || '',
      imageURL: sticker.url,
    }));
  }

  async getBackup(backupId) {
    return ServerBackup.findOne({ backupId });
  }

  async getUserBackups(userId, limit = 10) {
    return ServerBackup.find({ createdBy: userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('backupId guildId guildName createdAt type metadata notes');
  }

  async getGuildBackups(guildId, limit = 5) {
    return ServerBackup.find({ guildId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('backupId guildId guildName createdAt type metadata notes');
  }

  async deleteBackup(backupId, userId) {
    const backup = await ServerBackup.findOne({ backupId });
    if (!backup) throw new Error('Backup not found');
    if (backup.createdBy !== userId) throw new Error('You do not own this backup');
    await backup.deleteOne();
    return true;
  }

  formatBackupSummary(backup) {
    const m = backup.metadata;
    return [
      `📦 **ID:** \`${backup.backupId.slice(0, 8)}...\``,
      `🏠 **Server:** ${backup.guildName}`,
      `📅 **Created:** <t:${Math.floor(backup.createdAt.getTime() / 1000)}:R>`,
      `🎭 **Roles:** ${m.totalRoles} | 📚 **Channels:** ${m.totalChannels} | 😀 **Emojis:** ${m.totalEmojis}`,
    ].join('\n');
  }
}

module.exports = new BackupSystem();
