const { ChannelType, OverwriteType } = require('discord.js');
const { createContextLogger } = require('../utils/Logger');

const log = createContextLogger('ServerCloner');
const SLEEP = ms => new Promise(r => setTimeout(r, ms));

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
      log.info(`[Clone] ${stage}: ${message}`);
      if (onProgress) onProgress(stage, message, current, total);
    };

    const start = Date.now();
    const result = { rolesCreated: 0, channelsCreated: 0, categoriesCreated: 0, emojisCreated: 0, stickersCreated: 0, errors: [], duration: 0 };

    notify('Analyzing', 'Reading source server structure...', 1, 7);
    await SLEEP(500);

    notify('Cleaning', 'Clearing existing channels and roles...', 2, 7);
    await this._clearTarget(targetGuild);

    notify('Roles', 'Recreating roles...', 3, 7);
    const rolesResult = await this._cloneRoles(sourceGuild, targetGuild);
    result.rolesCreated = rolesResult.created;
    result.errors.push(...rolesResult.errors);

    notify('Categories', 'Recreating categories...', 4, 7);
    const catsResult = await this._cloneCategories(sourceGuild, targetGuild);
    result.categoriesCreated = catsResult.created;
    result.errors.push(...catsResult.errors);

    notify('Channels', 'Recreating channels...', 5, 7);
    const chResult = await this._cloneChannels(sourceGuild, targetGuild);
    result.channelsCreated = chResult.created;
    result.errors.push(...chResult.errors);

    notify('Emojis', 'Cloning emojis and stickers...', 6, 7);
    const emojiResult = await this._cloneEmojis(sourceGuild, targetGuild);
    result.emojisCreated = emojiResult.created;
    result.errors.push(...emojiResult.errors);

    const stickerResult = await this._cloneStickers(sourceGuild, targetGuild);
    result.stickersCreated = stickerResult.created;

    notify('Server Settings', 'Applying server settings...', 7, 7);
    await this._cloneServerSettings(sourceGuild, targetGuild);

    result.duration = Date.now() - start;
    log.info('Server clone complete', { source: sourceGuild.id, target: targetGuild.id, ...result });
    return result;
  }

  async _clearTarget(guild) {
    const chDel = guild.channels.cache.filter(c => c.deletable).map(c => c.delete().catch(() => {}));
    await Promise.allSettled(chDel);
    await SLEEP(500);
    const roleDel = guild.roles.cache
      .filter(r => r.editable && r.name !== '@everyone' && !r.managed)
      .map(r => r.delete().catch(() => {}));
    await Promise.allSettled(roleDel);
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
          name: role.name, color: role.color, hoist: role.hoist,
          mentionable: role.mentionable, permissions: role.permissions, reason: 'Server Clone',
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
    const cats = sourceGuild.channels.cache
      .filter(c => c.type === ChannelType.GuildCategory)
      .sort((a, b) => a.position - b.position);

    for (const cat of cats.values()) {
      try {
        const newCat = await targetGuild.channels.create({
          name: cat.name, type: ChannelType.GuildCategory, position: cat.position,
          permissionOverwrites: this._mapPerms(cat.permissionOverwrites.cache), reason: 'Server Clone',
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
        const opts = {
          name: ch.name, type: ch.type, position: ch.position,
          permissionOverwrites: this._mapPerms(ch.permissionOverwrites.cache), reason: 'Server Clone',
        };
        if (ch.parentId && this.channelMap.has(ch.parentId)) opts.parent = this.channelMap.get(ch.parentId);
        if (ch.topic) opts.topic = ch.topic;
        if (typeof ch.nsfw === 'boolean') opts.nsfw = ch.nsfw;
        if (ch.rateLimitPerUser) opts.rateLimitPerUser = ch.rateLimitPerUser;
        if (ch.bitrate) opts.bitrate = ch.bitrate;
        if (ch.userLimit) opts.userLimit = ch.userLimit;
        if (ch.defaultAutoArchiveDuration) opts.defaultAutoArchiveDuration = ch.defaultAutoArchiveDuration;

        const newCh = await targetGuild.channels.create(opts);
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
        await targetGuild.emojis.create({ attachment: emoji.imageURL({ size: 256 }), name: emoji.name, reason: 'Server Clone' });
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
          file: sticker.url, name: sticker.name,
          tags: sticker.tags || sticker.name, description: sticker.description || sticker.name, reason: 'Server Clone',
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
      if (sourceGuild.iconURL()) settings.icon = sourceGuild.iconURL({ size: 4096, dynamic: false, extension: 'png' });
      if (sourceGuild.afkChannelId && this.channelMap.has(sourceGuild.afkChannelId)) {
        settings.afkChannel = this.channelMap.get(sourceGuild.afkChannelId);
        settings.afkTimeout = sourceGuild.afkTimeout;
      }
      if (sourceGuild.systemChannelId && this.channelMap.has(sourceGuild.systemChannelId)) {
        settings.systemChannel = this.channelMap.get(sourceGuild.systemChannelId);
      }
      await targetGuild.edit(settings);
    } catch (err) {
      log.warn('Partial server settings failure', { error: err.message });
    }
  }

  _mapPerms(overwrites) {
    if (!overwrites) return [];
    return overwrites.values ? [...overwrites.values()].map(ow => ({
      id: this.roleMap.has(ow.id) ? this.roleMap.get(ow.id) : ow.id,
      type: ow.type,
      allow: ow.allow,
      deny: ow.deny,
    })) : [];
  }

  formatResult(result, sourceGuild, targetGuild) {
    const lines = [
      `✅ **Cloned:** ${sourceGuild.name} → ${targetGuild.name}`,
      ``,
      `🎭 Roles: **${result.rolesCreated}**`,
      `📚 Channels: **${result.channelsCreated}**`,
      `📁 Categories: **${result.categoriesCreated}**`,
      `😀 Emojis: **${result.emojisCreated}**`,
      `🎨 Stickers: **${result.stickersCreated}**`,
      `⏱️ Duration: **${(result.duration / 1000).toFixed(1)}s**`,
    ];
    if (result.errors.length > 0) lines.push(`\n⚠️ ${result.errors.length} minor warning(s)`);
    return lines.join('\n');
  }
}

module.exports = new ServerCloner();
