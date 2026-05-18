const { SlashCommandBuilder } = require('discord.js');
const Embed = require('../utils/EmbedBuilder');
const AIManager = require('../ai/AIManager');
const QueueSystem = require('../systems/QueueSystem');
const CacheSystem = require('../systems/CacheSystem');

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
    .addSubcommand(sub => sub.setName('queue').setDescription('Queue system status')),

  async execute(client, interaction) {
    await interaction.deferReply({ ephemeral: true });
    const sub = interaction.options.getSubcommand();

    if (sub === 'bot') {
      const memMb = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
      const aiStats = AIManager.getStats();
      const cacheStats = CacheSystem.getStats();

      const embed = Embed.stats({
        guilds: client.guilds.cache.size.toLocaleString(),
        users: client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0).toLocaleString(),
        clonesToday: aiStats.totalRequests.toString(),
        generationsToday: aiStats.successfulRequests.toString(),
        latency: `${client.ws.ping}ms`,
        memory: `${memMb}MB`,
        uptime: formatUptime(client.uptime),
        aiStatus: aiStats.status,
      });

      embed.addFields(
        { name: '🧠 Cache Hits', value: `${cacheStats.hits}`, inline: true },
        { name: '📊 Node.js', value: process.version, inline: true },
        { name: '🤖 Discord.js', value: require('discord.js').version, inline: true },
        { name: '🔄 AI Fallbacks', value: `${aiStats.fallbackCount}`, inline: true }
      );

      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'ai') {
      const stats = AIManager.getStats();
      const health = await AIManager.healthCheck();

      const embed = Embed.base({ color: 0x9B59B6, title: '🤖 AI System Status' });
      embed.addFields(
        { name: '🌐 OpenRouter', value: health.openrouter ? '🟢 Online' : '🔴 Offline', inline: true },
        { name: '⚡ Groq', value: health.groq ? '🟢 Online' : '🔴 Offline', inline: true },
        { name: '📊 Overall', value: stats.status, inline: true },
        { name: '📈 Total Requests', value: `${stats.totalRequests}`, inline: true },
        { name: '✅ Successful', value: `${stats.successfulRequests}`, inline: true },
        { name: '❌ Failed', value: `${stats.failedRequests}`, inline: true },
        { name: '🔄 Fallbacks Used', value: `${stats.fallbackCount}`, inline: true },
        { name: '🌐 OR Requests', value: `${stats.providerStats.openrouter.requests}`, inline: true },
        { name: '⚡ Groq Requests', value: `${stats.providerStats.groq.requests}`, inline: true },
        {
          name: '📊 Success Rate',
          value: stats.totalRequests > 0 ? `${Math.round((stats.successfulRequests / stats.totalRequests) * 100)}%` : 'N/A',
          inline: true,
        }
      );

      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'queue') {
      const status = QueueSystem.getAllStatus();
      const embed = Embed.base({ color: 0x00B0F4, title: '⚙️ Queue System Status' });

      embed.addFields(
        ...Object.entries(status).map(([name, s]) => ({
          name: `📋 ${name.charAt(0).toUpperCase() + name.slice(1)} Queue`,
          value: `Queued: **${s.size}** | Running: **${s.pending}**`,
          inline: true,
        }))
      );

      const activeJobs = QueueSystem.getActiveJobs();
      embed.addFields({
        name: '🏃 Active Jobs',
        value: activeJobs.length > 0 ? activeJobs.map(j => `• \`${j.id}\` — ${j.status}`).join('\n') : 'None',
        inline: false,
      });

      return interaction.editReply({ embeds: [embed] });
    }
  },
};
