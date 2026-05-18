require('dotenv').config();

const config = {
  discord: {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.DISCORD_CLIENT_ID,
    guildId: process.env.DISCORD_GUILD_ID,
    prefix: process.env.BOT_PREFIX || '!',
    ownerId: process.env.BOT_OWNER_ID,
    supportServer: process.env.BOT_SUPPORT_SERVER || 'https://discord.gg/support',
  },

  ai: {
    openrouter: {
      apiKey: process.env.OPENROUTER_API_KEY,
      baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
      model: process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet',
    },
    groq: {
      apiKey: process.env.GROQ_API_KEY,
      baseUrl: process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1',
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    },
    maxTokens: parseInt(process.env.AI_MAX_TOKENS) || 4096,
    temperature: parseFloat(process.env.AI_TEMPERATURE) || 0.7,
    timeoutMs: parseInt(process.env.AI_TIMEOUT_MS) || 30000,
    maxRetries: parseInt(process.env.AI_MAX_RETRIES) || 3,
  },

  database: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/discord-ai-bot',
    dbName: process.env.MONGODB_DB_NAME || 'discord-ai-bot',
    options: {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    },
  },

  rateLimit: {
    points: parseInt(process.env.RATE_LIMIT_POINTS) || 5,
    duration: parseInt(process.env.RATE_LIMIT_DURATION) || 60,
    cloneCooldown: parseInt(process.env.CLONE_COOLDOWN_SECONDS) || 300,
    generateCooldown: parseInt(process.env.GENERATE_COOLDOWN_SECONDS) || 120,
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
    dir: process.env.LOG_DIR || './logs',
    maxFiles: process.env.LOG_MAX_FILES || '14d',
    maxSize: process.env.LOG_MAX_SIZE || '20m',
  },

  performance: {
    queueConcurrency: parseInt(process.env.QUEUE_CONCURRENCY) || 3,
    cacheTtl: parseInt(process.env.CACHE_TTL) || 300,
    maxBackupSizeMb: parseInt(process.env.MAX_BACKUP_SIZE_MB) || 50,
  },

  environment: process.env.ENVIRONMENT || 'development',
  isDev: (process.env.ENVIRONMENT || 'development') === 'development',

  colors: {
    primary: 0x5865F2,
    success: 0x57F287,
    warning: 0xFEE75C,
    error: 0xED4245,
    info: 0x00B0F4,
    purple: 0x9B59B6,
    gold: 0xF1C40F,
    dark: 0x2F3136,
  },

  limits: {
    maxRoles: 250,
    maxChannels: 500,
    maxEmojis: 100,
    maxStickers: 60,
    maxCategories: 50,
    cloneTimeout: 300000,
    generateTimeout: 120000,
  },
};

function validate() {
  const required = [
    ['discord.token', config.discord.token],
    ['discord.clientId', config.discord.clientId],
  ];

  const missing = required.filter(([, val]) => !val).map(([key]) => key);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  if (!config.ai.openrouter.apiKey && !config.ai.groq.apiKey) {
    throw new Error('At least one AI provider API key is required (OPENROUTER_API_KEY or GROQ_API_KEY)');
  }
}

config.validate = validate;

module.exports = config;
