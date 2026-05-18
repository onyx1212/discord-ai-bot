const { ChannelType, PermissionFlagsBits } = require('discord.js');
const AIManager = require('../ai/AIManager');
const { createContextLogger } = require('../utils/Logger');
const Guild = require('../database/models/Guild');
const Log = require('../database/models/Log');

const log = createContextLogger('AIServerGenerator');

const SLEEP = (ms) => new Promise(r => setTimeout(r, ms));

function hexToInt(hex) {
  if (!hex) return 0;
  const clean = hex.replace('#', '');
  const parsed = parseInt(clean, 16);
  return isNaN(parsed) ? 0 : parsed;
}

class AIServerGenerator {
  async generate(targetGuild, prompt, options = {}) {
    const { onProgress, userId } = options;
    const start = Date.now();

    const notify = (stage, message) => {
      log.info(`[Generate] ${stage}: ${message}`, { guildId: targetGuild.id });
      if (onProgress) onProgress(stage, message);
    };

    notify('AI', 'Sending prompt to AI...');
    const { structure, provider, model } = await AIManager.generateServerStructure(prompt, {
      guildId: targetGuild.id,
      userId,
    });

    log.info('AI structure received', { provider, model, name: structure.name });

    notify('Validating', 'Validating AI response...');
    this._validateAndSanitize(structure);

    notify('Cleaning', 'Clearing existing structure...');
    await this._clearGuild(targetGuild);

    notify('Server Settings', 'Applying server settings...');
    await this._applyServerSettings(targetGuild, structure);

    notify('Roles', `Creating ${structure.roles?.length || 0} roles...`);
    const roleMap = await this._createRoles(targetGuild, structure.roles || []);

    notify('Categories & Channels', `Creating ${structure.categories?.length || 0} categories...`);
    await this._createCategories(targetGuild, structure.categories || [], roleMap);

    notify('Finalizing', 'Finishing up...');
    await SLEEP(500);

    const duration = Date.now() - start;

    await Guild.findOneAndUpdate(
      { guildId: targetGuild.id },
      {
        $inc: { 'stats.serversGenerated': 1 },
        'stats.lastActivity': new Date(),
        $push: {
          generateHistory: {
            $each: [{
              prompt,
              performedBy: userId,
              completedAt: new Date(),
              success: true,
              model,
            }],
            $slice: -20,
          },
        },
      },
      { upsert: true }
    );

    await Log.logEvent({
      level: 'info',
      event: 'server_generate_complete',
      guildId: targetGuild.id,
      userId,
      context: { prompt, provider, model, duration },
      aiProvider: provider,
      aiModel: model,
      success: true,
      duration,
    });

    log.info('Server generation complete', { guildId: targetGuild.id, duration, provider });

    return {
      structure,
      provider,
      model,
      duration,
      rolesCreated: structure.roles?.length || 0,
      categoriesCreated: structure.categories?.length || 0,
      channelsCreated: structure.categories?.reduce((a, c) => a + (c.channels?.length || 0), 0) || 0,
    };
  }

  _validateAndSanitize(structure) {
    if (!structure.name) structure.name = 'Generated Server';

    if (!Array.isArray(structure.roles)) structure.roles = [];
    if (!Array.isArray(structure.categories)) structure.categories = [];

    structure.roles = structure.roles
      .filter(r => r && r.name)
      .slice(0, 100)
      .map((r, i) => ({
        name: String(r.name).slice(0, 100),
        color: r.color || null,
        permissions: r.permissions || '0',
        hoist: Boolean(r.hoist),
        mentionable: Boolean(r.mentionable),
        position: typeof r.position === 'number' ? r.position : i,
      }));

    structure.categories = structure.categories
      .filter(c => c && c.name)
      .slice(0, 50)
      .map((cat, i) => ({
        name: String(cat.name).slice(0, 100).toUpperCase(),
        position: typeof cat.position === 'number' ? cat.position : i,
        channels: (Array.isArray(cat.channels) ? cat.channels : [])
          .filter(ch => ch && ch.name)
          .slice(0, 50)
          .map((ch, j) => ({
            name: String(ch.name).slice(0, 100).toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'channel',
            type: this._resolveChannelType(ch.type),
            topic: ch.topic ? String(ch.topic).slice(0, 1024) : '',
            nsfw: Boolean(ch.nsfw),
            slowmode: Math.min(parseInt(ch.slowmode) || 0, 21600),
            position: typeof ch.position === 'number' ? ch.position : j,
          })),
      }));
  }

  _resolveChannelType(type) {
    const map = {
      text: ChannelType.GuildText,
      voice: ChannelType.GuildVoice,
      stage: ChannelType.GuildStageVoice,
      forum: ChannelType.GuildForum,
      announcement: ChannelType.GuildAnnouncement,
      thread: ChannelType.GuildText,
    };
    return map[type?.toLowerCase()] || ChannelType.GuildText;
  }

  async _clearGuild(guild) {
    const chDel = guild.channels.cache.filter(c => c.deletable).map(c => c.delete().catch(() => {}));
    await Promise.allSettled(chDel);
    await SLEEP(400);

    const roleDel = guild.roles.cache
      .filter(r => r.editable && r.name !== '@everyone' && !r.managed)
      .map(r => r.delete().catch(() => {}));
    await Promise.allSettled(roleDel);
    await SLEEP(400);
  }

  async _applyServerSettings(guild, structure) {
    try {
      const settings = { reason: 'AI Server Generation' };
      if (structure.name) settings.name = String(structure.name).slice(0, 100);
      if (structure.description) settings.description = String(structure.description).slice(0, 1024);
      if (typeof structure.verificationLevel === 'number') {
        settings.verificationLevel = Math.min(Math.max(structure.verificationLevel, 0), 4);
      }
      await guild.edit(settings);
    } catch (err) {
      log.warn('Could not fully apply server settings', { error: err.message });
    }
  }

  async _createRoles(guild, roles) {
    const roleMap = new Map();
    const sorted = [...roles].sort((a, b) => b.position - a.position);

    for (const roleData of sorted) {
      try {
        let color = 0;
        if (roleData.color) {
          color = hexToInt(roleData.color);
        }

        const role = await guild.roles.create({
          name: roleData.name,
          color,
          hoist: roleData.hoist,
          mentionable: roleData.mentionable,
          reason: 'AI Server Generation',
        });

        roleMap.set(roleData.name.toLowerCase(), role.id);
        await SLEEP(120);
      } catch (err) {
        log.warn(`Could not create role "${roleData.name}"`, { error: err.message });
      }
    }

    return roleMap;
  }

  async _createCategories(guild, categories, roleMap) {
    for (const catData of categories) {
      try {
        const category = await guild.channels.create({
          name: catData.name,
          type: ChannelType.GuildCategory,
          position: catData.position,
          reason: 'AI Server Generation',
        });

        await SLEEP(150);

        for (const chData of catData.channels || []) {
          try {
            const chOptions = {
              name: chData.name,
              type: chData.type,
              parent: category.id,
              position: chData.position,
              reason: 'AI Server Generation',
            };

            if (chData.topic) chOptions.topic = chData.topic;
            if (chData.nsfw) chOptions.nsfw = chData.nsfw;
            if (chData.slowmode) chOptions.rateLimitPerUser = chData.slowmode;

            await guild.channels.create(chOptions);
            await SLEEP(100);
          } catch (err) {
            log.warn(`Could not create channel "${chData.name}"`, { error: err.message });
          }
        }
      } catch (err) {
        log.warn(`Could not create category "${catData.name}"`, { error: err.message });
      }
    }
  }

  formatResult(result) {
    const lines = [
      `✨ **AI Generated:** ${result.structure.name}`,
      ``,
      `**Structure Created:**`,
      `🎭 Roles: **${result.rolesCreated}**`,
      `📁 Categories: **${result.categoriesCreated}**`,
      `📚 Channels: **${result.channelsCreated}**`,
      `🤖 AI Provider: **${result.provider}**`,
      `⚡ Model: \`${result.model}\``,
      `⏱️ Duration: **${(result.duration / 1000).toFixed(1)}s**`,
    ];

    if (result.structure.description) {
      lines.push(`\n📝 **Description:** ${result.structure.description}`);
    }

    return lines.join('\n');
  }
}

module.exports = new AIServerGenerator();
