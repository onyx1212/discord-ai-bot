const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const Embed = require('../utils/EmbedBuilder');
const Security = require('../security/SecurityManager');
const AIManager = require('../ai/AIManager');
const QueueSystem = require('../systems/QueueSystem');
const CacheSystem = require('../systems/CacheSystem');
const { getStatus } = require('../database/connection');
const moment = require('moment');

function formatUptime(ms) {
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('View bot statistics and system health')
    .addSubcommand(sub => sub.setName('bot').setDescription('Global bot statistics'))
    .addSubcommand(sub => sub.setName('ai').setDescription('AI provider statistics and health'))
    .addSubcommand(sub => sub.setName('queue').setDescription('Queue system status'))
    .addSubcommand(sub => sub.setName('server').setDescription('This server\'s statistics')),

  async execute(client, interaction) {
    await interaction.deferReply({ ephemeral: true });
    const sub = interaction.options.getSubcommand();

    if (sub === 'bot') {
      const memUsage = process.memoryUsage();
      const memMb = Math.round(memUsage.heapUsed / 1024 / 1024);
      const aiStats = AIManager.getStats();
      const dbStatus = getStatus();
      const cacheStats = CacheSystem.getStats();

      const embed = Embed.stats({
        guilds: client.guilds.cache.size.toLocaleString(),
        users: client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0).toLocaleString(),
        clonesToday: 'N/A',
        generationsToday: 'N/A',
        latency: `${client.ws.ping}ms`,
        memory: `${memMb}MB`,
        uptime: formatUptime(client.uptime),
        aiStatus: aiStats.status,
      });

      embed.addFields(
        { name: '💾 Database', value: `${dbStatus.isConnected ? '🟢' : '🔴'} ${dbStatus.state}`, inline: true },
        { name: '🧠 Cache', value: `${cacheStats.hits} hits / ${cacheStats.misses} misses`, inline: true },
        { name: '📊 Node.js', value: process.version, inline: true },
        { name: '🤖 Discord.js', value: require('discord.js').version, inline: true },
        { name: '📡 Shard', value: `${client.shard?.ids?.join(', ') || '0'}`, inline: true },
        { name: '🔄 AI Requests', value: aiStats.totalRequests.toString(), inline: true }
      );

      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'ai') {
      const stats = AIManager.getStats();
      const health = await AIManager.healthCheck();

      const embed = Embed.base({
        color: 0x9B59B6,
        title: '🤖 AI System Status',
      });
      embed.addFields(
        { name: '🌐 OpenRouter', value: health.openrouter ? '🟢 Online' : '🔴 Offline', inline: true },
        { name: '⚡ Groq', value: health.groq ? '🟢 Online' : '🔴 Offline', inline: true },
        { name: '📊 Status', value: stats.status, inline: true },
        { name: '📈 Total Requests', value: stats.totalRequests.toString(), inline: true },
        { name: '✅ Successful', value: stats.successfulRequests.toString(), inline: true },
        { name: '❌ Failed', value: stats.failedRequests.toString(), inline: true },
        { name: '🔄 Fallbacks', value: stats.fallbackCount.toString(), inline: true },
        { name: '🌐 OpenRouter Requests', value: stats.providerStats.openrouter.requests.toString(), inline: true },
        { name: '⚡ Groq Requests', value: stats.providerStats.groq.requests.toString(), inline: true },
        { name: '🌐 OpenRouter Failures', value: stats.providerStats.openrouter.failures.toString(), inline: true },
        { name: '⚡ Groq Failures', value: stats.providerStats.groq.failures.toString(), inline: true },
        {
          name: '📊 Success Rate',
          value: stats.totalRequests > 0
            ? `${Math.round((stats.successfulRequests / stats.totalRequests) * 100)}%`
            : 'N/A',
          inline: true,
        }
      );

      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'queue') {
      const status = QueueSystem.getAllStatus();

      const embed = Embed.base({ color: 0x00B0F4, title: '⚙️ Queue System Status' });
      const fields = Object.entries(status).map(([name, s]) => ({
        name: `📋 ${name.charAt(0).toUpperCase() + name.slice(1)} Queue`,
        value: `Queued: **${s.size}** | Running: **${s.pending}**`,
        inline: true,
      }));
      embed.addFields(...fields);

      const activeJobs = QueueSystem.getActiveJobs();
      if (activeJobs.length > 0) {
        embed.addFields({
          name: '🏃 Active Jobs',
          value: activeJobs.map(j => `• \`${j.id}\` — ${j.status} (${j.queue})`).join('\n'),
          inline: false,
        });
      } else {
        embed.addFields({ name: '🏃 Active Jobs', value: 'No active jobs', inline: false });
      }

      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'server') {
      const { guild } = interaction;
      const Guild = require('../database/models/Guild');
      const guildData = await Guild.findOne({ guildId: guild.id });

      if (!guildData) {
        return interaction.editReply({ embeds: [Embed.info('No Data', 'No data recorded for this server yet.')] });
      }

      const embed = Embed.serverInfo(guild);
      embed.addFields(
        { name: '🔄 Clones Performed', value: `${guildData.stats.clonesPerformed}`, inline: true },
        { name: '🤖 Servers Generated', value: `${guildData.stats.serversGenerated}`, inline: true },
        { name: '📦 Backups Created', value: `${guildData.stats.backupsCreated}`, inline: true },
        { name: '⏰ Last Activity', value: guildData.stats.lastActivity ? `<t:${Math.floor(guildData.stats.lastActivity.getTime() / 1000)}:R>` : 'Never', inline: false }
      );

      return interaction.editReply({ embeds: [embed] });
    }
  },
};
