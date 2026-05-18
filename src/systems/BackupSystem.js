const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { createContextLogger } = require('../utils/Logger');

const log = createContextLogger('BackupSystem');
const DATA_FILE = path.join(__dirname, '../data/backups.json');

class BackupSystem {
  constructor() {
    this._ensureFile();
  }

  _ensureFile() {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({}), 'utf8');
  }

  _load() {
    try {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch {
      return {};
    }
  }

  _save(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  }

  async createBackup(guild, userId, options = {}) {
    log.info('Creating server backup', { guildId: guild.id, userId });
    const start = Date.now();

    const roles = this._serializeRoles(guild);
    const { categories, channels } = this._serializeChannels(guild);
    const emojis = this._serializeEmojis(guild);
    const stickers = this._serializeStickers(guild);

    const backup = {
      backupId: uuidv4(),
      guildId: guild.id,
      guildName: guild.name,
      createdBy: userId,
      type: options.type || 'manual',
      notes: options.notes || '',
      createdAt: new Date().toISOString(),

      guild: {
        name: guild.name,
        description: guild.description || '',
        icon: guild.iconURL({ dynamic: true, size: 4096 }) || null,
        banner: guild.bannerURL?.({ size: 4096 }) || null,
        verificationLevel: guild.verificationLevel,
        defaultMessageNotifications: guild.defaultMessageNotifications,
        explicitContentFilter: guild.explicitContentFilter,
        preferredLocale: guild.preferredLocale,
        afkChannelId: guild.afkChannelId,
        afkTimeout: guild.afkTimeout,
        systemChannelId: guild.systemChannelId,
        features: [...(guild.features || [])],
      },

      roles,
      categories,
      channels,
      emojis,
      stickers,

      metadata: {
        totalRoles: roles.length,
        totalChannels: channels.length + categories.reduce((a, c) => a + (c.channels?.length || 0), 0),
        totalEmojis: emojis.length,
        totalStickers: stickers.length,
      },
    };

    const all = this._load();
    all[backup.backupId] = backup;
    this._save(all);

    log.info('Backup created', {
      backupId: backup.backupId,
      guildId: guild.id,
      duration: Date.now() - start,
    });

    return backup;
  }

  _serializeRoles(guild) {
    return guild.roles.cache
      .filter(r => !r.managed && r.name !== '@everyone')
      .sort((a, b) => a.position - b.position)
      .map(r => ({
        originalId: r.id,
        name: r.name,
        color: r.color,
        hoist: r.hoist,
        mentionable: r.mentionable,
        permissions: r.permissions.bitfield.toString(),
        position: r.position,
        icon: r.iconURL() || null,
        unicodeEmoji: r.unicodeEmoji || null,
      }));
  }

  _serializeChannels(guild) {
    const categories = [];
    const orphanChannels = [];

    guild.channels.cache
      .filter(c => c.type === 4)
      .sort((a, b) => a.position - b.position)
      .forEach(cat => {
        const children = guild.channels.cache
          .filter(c => c.parentId === cat.id)
          .sort((a, b) => a.position - b.position)
          .map(ch => this._serializeChannel(ch));

        categories.push({
          originalId: cat.id,
          name: cat.name,
          position: cat.position,
          permissionOverwrites: this._serializePerms(cat),
          channels: children,
        });
      });

    guild.channels.cache
      .filter(c => !c.parentId && c.type !== 4)
      .sort((a, b) => a.position - b.position)
      .forEach(ch => orphanChannels.push(this._serializeChannel(ch)));

    return { categories, channels: orphanChannels };
  }

  _serializeChannel(ch) {
    const base = {
      originalId: ch.id,
      name: ch.name,
      type: ch.type,
      position: ch.position,
      permissionOverwrites: this._serializePerms(ch),
    };
    if (ch.topic) base.topic = ch.topic;
    if (ch.nsfw) base.nsfw = ch.nsfw;
    if (ch.rateLimitPerUser) base.rateLimitPerUser = ch.rateLimitPerUser;
    if (ch.bitrate) base.bitrate = ch.bitrate;
    if (ch.userLimit) base.userLimit = ch.userLimit;
    return base;
  }

  _serializePerms(channel) {
    if (!channel.permissionOverwrites?.cache) return [];
    return channel.permissionOverwrites.cache.map(ow => ({
      id: ow.id,
      type: ow.type,
      allow: ow.allow.bitfield.toString(),
      deny: ow.deny.bitfield.toString(),
    }));
  }

  _serializeEmojis(guild) {
    return guild.emojis.cache.map(e => ({
      originalId: e.id,
      name: e.name,
      imageURL: e.imageURL({ size: 256 }),
      animated: e.animated,
    }));
  }

  _serializeStickers(guild) {
    return guild.stickers.cache.map(s => ({
      originalId: s.id,
      name: s.name,
      description: s.description || '',
      tags: s.tags || '',
      imageURL: s.url,
    }));
  }

  getBackup(backupId) {
    const all = this._load();
    return Object.values(all).find(b =>
      b.backupId === backupId || b.backupId.startsWith(backupId)
    ) || null;
  }

  getUserBackups(userId, limit = 10) {
    const all = this._load();
    return Object.values(all)
      .filter(b => b.createdBy === userId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, limit);
  }

  deleteBackup(backupId, userId) {
    const all = this._load();
    const backup = Object.values(all).find(b =>
      b.backupId === backupId || b.backupId.startsWith(backupId)
    );
    if (!backup) throw new Error('Backup not found');
    if (backup.createdBy !== userId) throw new Error('You do not own this backup');
    delete all[backup.backupId];
    this._save(all);
    return true;
  }

  formatBackupSummary(backup) {
    const m = backup.metadata;
    const ts = Math.floor(new Date(backup.createdAt).getTime() / 1000);
    return [
      `📦 **ID:** \`${backup.backupId.slice(0, 8)}...\``,
      `🏠 **Server:** ${backup.guildName}`,
      `📅 **Created:** <t:${ts}:R>`,
      `🎭 **Roles:** ${m.totalRoles} | 📚 **Channels:** ${m.totalChannels} | 😀 **Emojis:** ${m.totalEmojis}`,
    ].join('\n');
  }
}

module.exports = new BackupSystem();
