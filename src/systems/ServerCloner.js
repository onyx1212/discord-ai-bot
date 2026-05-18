const { ChannelType, PermissionsBitField, OverwriteType } = require('discord.js');
const { createContextLogger } = require('../utils/Logger');
const BackupSystem = require('./BackupSystem');
const Guild = require('../database/models/Guild');
const Log = require('../database/models/Log');

const log = createContextLogger('ServerCloner');

const SLEEP = (ms) => new Promise(r => setTimeout(r, ms));

class ServerCloner {
  constructor() {
    this.roleMap = new Map();
    this.channelMap = new Map();
  }

  async clone(sourceGuild, targetGuild, options = {}) {
    const { onProgress } = options;
    this.roleMap = new Map();
    this.channelMap = new Map();

    const notify = (stage, message, current, total) => {
      log.info(`[Clone] ${stage}: ${message}`, { source: sourceGuild.id, target: targetGuild.id });
      if (onProgress) onProgress(stage, message, current, total);
    };

    const start = Date.now();
    const result = {
      rolesCreated: 0,
      channelsCreated: 0,
      categoriesCreated: 0,
      emojisCreated: 0,
      stickersCreated: 0,
      errors: [],
      duration: 0,
    };

    try {
      notify('Analyzing', 'Reading source server structure...', 1, 7);
      await SLEEP(500);

      notify('Cleaning', 'Clearing existing channels and roles...', 2, 7);
      await this._clearTarget(targetGuild);
      await SLEEP(300);

      notify('Roles', 'Recreating roles...', 3, 7);
      const rolesResult = await this._cloneRoles(sourceGuild, targetGuild);
      result.rolesCreated = rolesResult.created;
      result.errors.push(...rolesResult.errors);
      await SLEEP(300);

      notify('Categories', 'Recreating categories...', 4, 7);
      const catsResult = await this._cloneCategories(sourceGuild, targetGuild);
      result.categoriesCreated = catsResult.created;
      result.errors.push(...catsResult.errors);
      await SLEEP(200);

      notify('Channels', 'Recreating channels...', 5, 7);
      const chResult = await this._cloneChannels(sourceGuild, targetGuild);
      result.channelsCreated = chResult.created;
      result.errors.push(...chResult.errors);
      await SLEEP(200);

      notify('Emojis', 'Cloning emojis and stickers...', 6, 7);
      const emojiResult = await this._cloneEmojis(sourceGuild, targetGuild);
      result.emojisCreated = emojiResult.created;
      result.errors.push(...emojiResult.errors);

      const stickerResult = await this._cloneStickers(sourceGuild, targetGuild);
      result.stickersCreated = stickerResult.created;

      notify('Server Settings', 'Applying server settings...', 7, 7);
      await this._cloneServerSettings(sourceGuild, targetGuild);

      result.duration = Date.now() - start;

      await Guild.findOneAndUpdate(
        { guildId: targetGuild.id },
        {
          $inc: { 'stats.clonesPerformed': 1 },
          'stats.lastActivity': new Date(),
          $push: {
            cloneHistory: {
              $each: [{
                sourceGuildId: sourceGuild.id,
                sourceGuildName: sourceGuild.name,
                performedBy: options.userId,
                completedAt: new Date(),
                success: true,
                channelsCloned: result.channelsCreated,
                rolesCloned: result.rolesCreated,
                emojisCloned: result.emojisCreated,
              }],
              $slice: -20,
            },
          },
        },
        { upsert: true }
      );

      await Log.logEvent({
        level: 'info',
        event: 'server_clone_complete',
        guildId: targetGuild.id,
        userId: options.userId,
        context: {
          sourceGuildId: sourceGuild.id,
          sourceGuildName: sourceGuild.name,
          ...result,
        },
        success: true,
        duration: result.duration,
      });

      log.info('Server clone complete', { source: sourceGuild.id, target: targetGuild.id, ...result });
      return result;

    } catch (err) {
      log.error('Server clone failed', { source: sourceGuild.id, target: targetGuild.id, error: err.message });
      await Log.logEvent({
        level: 'error',
        event: 'server_clone_failed',
        guildId: targetGuild.id,
        userId: options.userId,
        error: { message: err.message, stack: err.stack },
        success: false,
      });
      throw err;
    }
  }

  async _clearTarget(guild) {
    const channelDeletions = guild.channels.cache
      .filter(c => c.deletable)
      .map(c => c.delete().catch(() => {}));
    await Promise.allSettled(channelDeletions);
    await SLEEP(500);

    const roleDeletions = guild.roles.cache
      .filter(r => r.editable && r.name !== '@everyone' && !r.managed)
      .map(r => r.delete().catch(() => {}));
    await Promise.allSettled(roleDeletions);
    await SLEEP(500);
  }

  async _cloneRoles(sourceGuild, targetGuild) {
    const result = { created: 0, errors: [] };

    const roles = sourceGuild.roles.cache
      .filter(r => r.name !== '@everyone' && !r.managed)
      .sort((a, b) => a.position - b.position);

    for (const role of roles.values()) {
      try {
        const newRole = await targetGuild.roles.create({
          name: role.name,
          color: role.color,
          hoist: role.hoist,
          mentionable: role.mentionable,
          permissions: role.permissions,
          reason: 'Server Clone',
        });
        this.roleMap.set(role.id, newRole.id);
        result.created++;
        await SLEEP(100);
      } catch (err) {
        result.errors.push(`Role "${role.name}": ${err.message}`);
      }
    }

    return result;
  }

  async _cloneCategories(sourceGuild, targetGuild) {
    const result = { created: 0, errors: [] };

    const categories = sourceGuild.channels.cache
      .filter(c => c.type === ChannelType.GuildCategory)
      .sort((a, b) => a.position - b.position);

    for (const cat of categories.values()) {
      try {
        const newCat = await targetGuild.channels.create({
          name: cat.name,
          type: ChannelType.GuildCategory,
          position: cat.position,
          permissionOverwrites: this._mapPermissions(cat.permissionOverwrites.cache),
          reason: 'Server Clone',
        });
        this.channelMap.set(cat.id, newCat.id);
        result.created++;
        await SLEEP(150);
      } catch (err) {
        result.errors.push(`Category "${cat.name}": ${err.message}`);
      }
    }

    return result;
  }

  async _cloneChannels(sourceGuild, targetGuild) {
    const result = { created: 0, errors: [] };

    const channels = sourceGuild.channels.cache
      .filter(c => c.type !== ChannelType.GuildCategory)
      .sort((a, b) => a.position - b.position);

    for (const ch of channels.values()) {
      try {
        const options = {
          name: ch.name,
          type: ch.type,
          position: ch.position,
          permissionOverwrites: this._mapPermissions(ch.permissionOverwrites.cache),
          reason: 'Server Clone',
        };

        if (ch.parentId && this.channelMap.has(ch.parentId)) {
          options.parent = this.channelMap.get(ch.parentId);
        }

        if (ch.topic) options.topic = ch.topic;
        if (typeof ch.nsfw === 'boolean') options.nsfw = ch.nsfw;
        if (ch.rateLimitPerUser) options.rateLimitPerUser = ch.rateLimitPerUser;
        if (ch.bitrate) options.bitrate = ch.bitrate;
        if (ch.userLimit) options.userLimit = ch.userLimit;
        if (ch.defaultAutoArchiveDuration) options.defaultAutoArchiveDuration = ch.defaultAutoArchiveDuration;

        if (ch.type === ChannelType.GuildForum && ch.availableTags?.length > 0) {
          options.availableTags = ch.availableTags.map(t => ({
            name: t.name,
            moderated: t.moderated,
          }));
        }

        const newCh = await targetGuild.channels.create(options);
        this.channelMap.set(ch.id, newCh.id);
        result.created++;
        await SLEEP(100);
      } catch (err) {
        result.errors.push(`Channel "${ch.name}": ${err.message}`);
      }
    }

    return result;
  }

  async _cloneEmojis(sourceGuild, targetGuild) {
    const result = { created: 0, errors: [] };
    const maxEmojis = targetGuild.premiumTier === 2 ? 150 : targetGuild.premiumTier === 3 ? 250 : 50;

    let count = 0;
    for (const emoji of sourceGuild.emojis.cache.values()) {
      if (count >= maxEmojis) break;
      try {
        await targetGuild.emojis.create({
          attachment: emoji.imageURL({ size: 256 }),
          name: emoji.name,
          reason: 'Server Clone',
        });
        result.created++;
        count++;
        await SLEEP(300);
      } catch (err) {
        result.errors.push(`Emoji "${emoji.name}": ${err.message}`);
      }
    }

    return result;
  }

  async _cloneStickers(sourceGuild, targetGuild) {
    const result = { created: 0, errors: [] };

    for (const sticker of sourceGuild.stickers.cache.values()) {
      try {
        await targetGuild.stickers.create({
          file: sticker.url,
          name: sticker.name,
          tags: sticker.tags || sticker.name,
          description: sticker.description || sticker.name,
          reason: 'Server Clone',
        });
        result.created++;
        await SLEEP(300);
      } catch (err) {
        result.errors.push(`Sticker "${sticker.name}": ${err.message}`);
      }
    }

    return result;
  }

  async _cloneServerSettings(sourceGuild, targetGuild) {
    try {
      const settings = {
        name: sourceGuild.name,
        verificationLevel: sourceGuild.verificationLevel,
        defaultMessageNotifications: sourceGuild.defaultMessageNotifications,
        explicitContentFilter: sourceGuild.explicitContentFilter,
        preferredLocale: sourceGuild.preferredLocale,
        reason: 'Server Clone',
      };

      if (sourceGuild.description) settings.description = sourceGuild.description;

      if (sourceGuild.afkChannelId && this.channelMap.has(sourceGuild.afkChannelId)) {
        settings.afkChannel = this.channelMap.get(sourceGuild.afkChannelId);
        settings.afkTimeout = sourceGuild.afkTimeout;
      }

      if (sourceGuild.systemChannelId && this.channelMap.has(sourceGuild.systemChannelId)) {
        settings.systemChannel = this.channelMap.get(sourceGuild.systemChannelId);
      }

      if (sourceGuild.iconURL()) {
        settings.icon = sourceGuild.iconURL({ size: 4096, dynamic: false, extension: 'png' });
      }

      if (sourceGuild.bannerURL && targetGuild.features.includes('BANNER')) {
        settings.banner = sourceGuild.bannerURL({ size: 4096 });
      }

      await targetGuild.edit(settings);
    } catch (err) {
      log.warn('Partial server settings clone failure', { error: err.message });
    }
  }

  _mapPermissions(overwrites) {
    if (!overwrites) return [];
    const mapped = [];

    for (const ow of overwrites.values()) {
      let id = ow.id;

      if (ow.type === OverwriteType.Role && this.roleMap.has(ow.id)) {
        id = this.roleMap.get(ow.id);
      }

      mapped.push({
        id,
        type: ow.type,
        allow: ow.allow,
        deny: ow.deny,
      });
    }

    return mapped;
  }

  formatResult(result, sourceGuild, targetGuild) {
    const lines = [
      `✅ **Cloned:** ${sourceGuild.name} → ${targetGuild.name}`,
      ``,
      `**Results:**`,
      `🎭 Roles: **${result.rolesCreated}**`,
      `📚 Channels: **${result.channelsCreated}**`,
      `📁 Categories: **${result.categoriesCreated}**`,
      `😀 Emojis: **${result.emojisCreated}**`,
      `🎨 Stickers: **${result.stickersCreated}**`,
      `⏱️ Duration: **${(result.duration / 1000).toFixed(1)}s**`,
    ];

    if (result.errors.length > 0) {
      lines.push(`\n⚠️ **${result.errors.length} warning(s)** (minor items that couldn't be copied)`);
    }

    return lines.join('\n');
  }
}

module.exports = new ServerCloner();
