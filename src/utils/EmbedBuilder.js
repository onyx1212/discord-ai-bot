const { EmbedBuilder } = require('discord.js');
const config = require('../config');

class BotEmbedBuilder {
  static base(options = {}) {
    const embed = new EmbedBuilder()
      .setColor(options.color ?? config.colors.primary)
      .setTimestamp();

    if (options.title) embed.setTitle(options.title);
    if (options.description) embed.setDescription(options.description);
    if (options.thumbnail) embed.setThumbnail(options.thumbnail);
    if (options.image) embed.setImage(options.image);
    if (options.url) embed.setURL(options.url);
    if (options.footer !== false) {
      embed.setFooter({
        text: options.footerText || 'Discord AI Bot • Enterprise Edition',
        iconURL: options.footerIcon || null,
      });
    }

    return embed;
  }

  static success(title, description, extra = {}) {
    return this.base({
      color: config.colors.success,
      title: `✅ ${title}`,
      description,
      ...extra,
    });
  }

  static error(title, description, extra = {}) {
    return this.base({
      color: config.colors.error,
      title: `❌ ${title}`,
      description,
      ...extra,
    });
  }

  static warning(title, description, extra = {}) {
    return this.base({
      color: config.colors.warning,
      title: `⚠️ ${title}`,
      description,
      ...extra,
    });
  }

  static info(title, description, extra = {}) {
    return this.base({
      color: config.colors.info,
      title: `ℹ️ ${title}`,
      description,
      ...extra,
    });
  }

  static loading(title, description, extra = {}) {
    return this.base({
      color: config.colors.primary,
      title: `⏳ ${title}`,
      description: description || 'Please wait while we process your request...',
      ...extra,
    });
  }

  static progress(title, current, total, description = '', extra = {}) {
    const percent = Math.round((current / total) * 100);
    const filled = Math.round(percent / 5);
    const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);
    return this.base({
      color: config.colors.primary,
      title: `🔄 ${title}`,
      description: `${description}\n\n\`${bar}\` **${percent}%**\n*Step ${current} of ${total}*`,
      ...extra,
    });
  }

  static serverInfo(guild, extra = {}) {
    const embed = this.base({
      color: config.colors.primary,
      title: `📋 Server Info: ${guild.name}`,
      thumbnail: guild.iconURL({ dynamic: true, size: 256 }),
      ...extra,
    });

    embed.addFields(
      { name: '👥 Members', value: `${guild.memberCount.toLocaleString()}`, inline: true },
      { name: '📚 Channels', value: `${guild.channels.cache.size}`, inline: true },
      { name: '🎭 Roles', value: `${guild.roles.cache.size}`, inline: true },
      { name: '😀 Emojis', value: `${guild.emojis.cache.size}`, inline: true },
      { name: '🌍 Region', value: guild.preferredLocale || 'Auto', inline: true },
      { name: '🔒 Verification', value: guild.verificationLevel?.toString() || 'None', inline: true },
      { name: '🆔 Server ID', value: `\`${guild.id}\``, inline: false }
    );

    return embed;
  }

  static cloneProgress(stage, message, current, total, extra = {}) {
    const stages = ['Analyzing', 'Roles', 'Categories', 'Channels', 'Emojis', 'Permissions', 'Finalizing'];
    const stageIndex = stages.indexOf(stage);
    const stageDisplay = stages.map((s, i) => {
      if (i < stageIndex) return `✅ ${s}`;
      if (i === stageIndex) return `🔄 **${s}**`;
      return `⬜ ${s}`;
    }).join('\n');

    return this.base({
      color: config.colors.primary,
      title: '🔄 Cloning Server...',
      description: `**Current Stage:** ${message}\n\n**Progress:**\n${stageDisplay}`,
      footer: false,
      footerText: `Step ${current} of ${total}`,
      ...extra,
    }).setFooter({ text: `Step ${current} of ${total} • Please wait...` });
  }

  static generateProgress(stage, message, extra = {}) {
    return this.base({
      color: config.colors.purple,
      title: '🤖 AI Generating Server...',
      description: `**Stage:** ${stage}\n**Status:** ${message}\n\n*The AI is crafting your perfect server...*`,
      ...extra,
    });
  }

  static aiResult(prompt, structure, extra = {}) {
    return this.base({
      color: config.colors.gold,
      title: '✨ AI Server Generated',
      description: `**Prompt:** "${prompt}"\n\n**Structure Created:**\n${structure}`,
      ...extra,
    });
  }

  static help(commands, extra = {}) {
    return this.base({
      color: config.colors.primary,
      title: '🤖 Discord AI Bot — Command Reference',
      description: '**Enterprise-grade server management and AI generation**',
      ...extra,
    }).addFields(...commands.map(cmd => ({
      name: `/${cmd.name}`,
      value: cmd.description,
      inline: false,
    })));
  }

  static stats(data, extra = {}) {
    const embed = this.base({
      color: config.colors.primary,
      title: '📊 Bot Statistics',
      ...extra,
    });

    embed.addFields(
      { name: '📡 Servers', value: `${data.guilds}`, inline: true },
      { name: '👤 Users', value: `${data.users}`, inline: true },
      { name: '🔄 Clones Today', value: `${data.clonesToday}`, inline: true },
      { name: '🤖 Generations Today', value: `${data.generationsToday}`, inline: true },
      { name: '⚡ Latency', value: `${data.latency}ms`, inline: true },
      { name: '💾 Memory', value: `${data.memory}MB`, inline: true },
      { name: '⏱️ Uptime', value: data.uptime, inline: true },
      { name: '🟢 AI Status', value: data.aiStatus, inline: true }
    );

    return embed;
  }

  static paginate(items, page, perPage, title, color, formatter) {
    const totalPages = Math.ceil(items.length / perPage);
    const start = (page - 1) * perPage;
    const pageItems = items.slice(start, start + perPage);

    return this.base({
      color: color ?? config.colors.primary,
      title,
      description: pageItems.map(formatter).join('\n'),
      footerText: `Page ${page} of ${totalPages} • ${items.length} total`,
      footer: false,
    }).setFooter({ text: `Page ${page} of ${totalPages} • ${items.length} total items` });
  }
}

module.exports = BotEmbedBuilder;
