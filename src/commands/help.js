const { SlashCommandBuilder } = require('discord.js');
const Embed = require('../utils/EmbedBuilder');
const config = require('../config');

const COMMANDS = [
  {
    name: 'clone',
    description: '**Clone** any Discord server into this one.\nProvide a server invite link or ID. Copies roles, channels, categories, emojis, and settings.',
    category: '🔄 Server Tools',
  },
  {
    name: 'generate',
    description: '**AI-generate** a complete server from a text prompt.\nDescribe the vibe (e.g. "cyberpunk gaming server") and the AI builds the whole structure.',
    category: '🤖 AI Tools',
  },
  {
    name: 'backup create',
    description: '**Create a backup** of this server\'s structure (roles, channels, settings, emojis).',
    category: '📦 Backups',
  },
  {
    name: 'backup list',
    description: '**List** all your saved server backups.',
    category: '📦 Backups',
  },
  {
    name: 'backup info',
    description: '**Inspect** a specific backup by ID.',
    category: '📦 Backups',
  },
  {
    name: 'backup delete',
    description: '**Delete** a saved backup.',
    category: '📦 Backups',
  },
  {
    name: 'restore',
    description: '**Restore** a previous backup to this server.',
    category: '📦 Backups',
  },
  {
    name: 'stats bot',
    description: '**Bot statistics** — uptime, memory, ping, and more.',
    category: '📊 Statistics',
  },
  {
    name: 'stats ai',
    description: '**AI system status** — provider health, request counts, fallback stats.',
    category: '📊 Statistics',
  },
  {
    name: 'stats queue',
    description: '**Queue status** — active and pending jobs.',
    category: '📊 Statistics',
  },
  {
    name: 'stats server',
    description: '**Server statistics** — clones, generations, and activity.',
    category: '📊 Statistics',
  },
  {
    name: 'help',
    description: '**Show this help menu**.',
    category: '📖 General',
  },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show all bot commands and usage guide'),

  async execute(client, interaction) {
    const categories = {};
    for (const cmd of COMMANDS) {
      if (!categories[cmd.category]) categories[cmd.category] = [];
      categories[cmd.category].push(cmd);
    }

    const embed = Embed.base({
      color: config.colors.primary,
      title: '🤖 Discord AI Bot — Help',
      description:
        'Enterprise-grade server management powered by AI.\n\n' +
        '**Two core features:**\n' +
        '> 🔄 **Server Cloner** — Copy any server structure instantly\n' +
        '> ✨ **AI Generator** — Generate servers from text prompts\n\n' +
        '**AI Providers:** OpenRouter (primary) → Groq (fallback)\n' +
        '**Database:** MongoDB | **Storage:** Unlimited backups\n',
    });

    for (const [category, cmds] of Object.entries(categories)) {
      embed.addFields({
        name: category,
        value: cmds.map(c => `\`/${c.name}\` — ${c.description.split('\n')[0]}`).join('\n'),
        inline: false,
      });
    }

    embed.addFields({
      name: '🔗 Links',
      value: `[Support Server](${config.discord.supportServer}) • [GitHub](https://github.com/discord-ai-bot)`,
      inline: false,
    });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
