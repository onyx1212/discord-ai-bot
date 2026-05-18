const OpenRouterProvider = require('./providers/OpenRouterProvider');
const GroqProvider = require('./providers/GroqProvider');
const { createContextLogger } = require('../utils/Logger');

const log = createContextLogger('AIManager');

class AIManager {
  constructor() {
    this.providers = {
      openrouter: new OpenRouterProvider(),
      groq: new GroqProvider(),
    };

    this.primaryProvider = 'openrouter';
    this.fallbackProvider = 'groq';

    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      fallbackCount: 0,
      providerStats: {
        openrouter: { requests: 0, failures: 0 },
        groq: { requests: 0, failures: 0 },
      },
    };

    this.retryDelays = [1000, 2000, 4000];
  }

  async complete(messages, options = {}) {
    this.stats.totalRequests++;

    const primary = this.providers[this.primaryProvider];
    const fallback = this.providers[this.fallbackProvider];

    if (primary.isAvailable()) {
      try {
        const result = await this._attemptWithRetry(primary, messages, options);
        this.stats.successfulRequests++;
        this.stats.providerStats[this.primaryProvider].requests++;
        return result;
      } catch (primaryErr) {
        log.warn(`Primary provider (${this.primaryProvider}) failed, switching to ${this.fallbackProvider}`, {
          error: primaryErr.message,
          code: primaryErr.code,
          status: primaryErr.status,
        });
        this.stats.providerStats[this.primaryProvider].failures++;
        this.stats.fallbackCount++;
      }
    } else {
      log.info(`Primary provider unavailable, using ${this.fallbackProvider} directly`);
    }

    if (fallback.isAvailable()) {
      try {
        const result = await this._attemptWithRetry(fallback, messages, options);
        this.stats.successfulRequests++;
        this.stats.providerStats[this.fallbackProvider].requests++;
        log.info(`Fallback to ${this.fallbackProvider} succeeded`);
        return result;
      } catch (fallbackErr) {
        this.stats.failedRequests++;
        this.stats.providerStats[this.fallbackProvider].failures++;
        log.error('Both AI providers failed', { error: fallbackErr.message });
        throw new Error('All AI providers are currently unavailable. Please try again in a few moments.');
      }
    }

    this.stats.failedRequests++;
    throw new Error('No AI providers are configured or available.');
  }

  async _attemptWithRetry(provider, messages, options, attempt = 0) {
    try {
      return await provider.complete(messages, options);
    } catch (err) {
      const maxAttempts = options.maxRetries ?? 2;
      if (err.retryable && attempt < maxAttempts) {
        const delay = this.retryDelays[attempt] || 4000;
        log.warn(`Retrying ${provider.name} in ${delay}ms (attempt ${attempt + 1}/${maxAttempts})`, { error: err.message });
        await new Promise(resolve => setTimeout(resolve, delay));
        return this._attemptWithRetry(provider, messages, options, attempt + 1);
      }
      throw err;
    }
  }

  async generateServerStructure(prompt, options = {}) {
    const systemPrompt = `You are an expert Discord server architect. Your task is to design a complete, professional Discord server structure based on the user's request.

Generate a valid JSON object with this exact structure:
{
  "name": "Server Name",
  "description": "Short server description",
  "verificationLevel": 1,
  "roles": [
    { "name": "Admin", "color": "#FF0000", "hoist": true, "mentionable": false, "position": 10 },
    { "name": "Moderator", "color": "#FF6600", "hoist": true, "mentionable": true, "position": 9 }
  ],
  "categories": [
    {
      "name": "INFORMATION",
      "position": 0,
      "channels": [
        { "name": "rules", "type": "text", "topic": "Server rules and guidelines", "nsfw": false, "slowmode": 0, "position": 0 },
        { "name": "announcements", "type": "announcement", "topic": "Official announcements", "position": 1 }
      ]
    }
  ]
}

IMPORTANT RULES:
- Generate REAL content relevant to the theme. Make it feel handcrafted.
- Include 4-8 categories, each with 3-8 channels.
- Include 8-15 roles with a clear hierarchy.
- Channel names must be lowercase with hyphens only (no spaces).
- All content must be theme-appropriate and professional.
- Include moderation, logging, and community channels.
- Colors should be hex strings like "#FF5733".
- verificationLevel: 0=None, 1=Low, 2=Medium, 3=High, 4=VeryHigh
- Return ONLY valid JSON. No markdown. No explanation. Just the JSON object.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Create a Discord server for: ${prompt}` },
    ];

    const result = await this.complete(messages, {
      ...options,
      jsonMode: true,
      maxTokens: 4096,
      temperature: 0.8,
    });

    let parsed;
    try {
      parsed = JSON.parse(result.content);
    } catch {
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('AI returned invalid JSON structure');
      parsed = JSON.parse(jsonMatch[0]);
    }

    return { structure: parsed, provider: result.provider, model: result.model, usage: result.usage };
  }

  getStats() {
    const primaryAvail = this.providers[this.primaryProvider].isAvailable();
    const fallbackAvail = this.providers[this.fallbackProvider].isAvailable();
    return {
      ...this.stats,
      primaryProvider: this.primaryProvider,
      fallbackProvider: this.fallbackProvider,
      primaryAvailable: primaryAvail,
      fallbackAvailable: fallbackAvail,
      status: primaryAvail ? '🟢 Primary Online' : fallbackAvail ? '🟡 Fallback Only' : '🔴 All Offline',
    };
  }

  async healthCheck() {
    const results = await Promise.allSettled([
      this.providers.openrouter.ping(),
      this.providers.groq.ping(),
    ]);
    return {
      openrouter: results[0].status === 'fulfilled' && results[0].value,
      groq: results[1].status === 'fulfilled' && results[1].value,
    };
  }
}

module.exports = new AIManager();
