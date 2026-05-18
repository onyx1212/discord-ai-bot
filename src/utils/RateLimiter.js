const { RateLimiterMemory } = require('rate-limiter-flexible');
const config = require('../config');
const { createContextLogger } = require('./Logger');

const log = createContextLogger('RateLimiter');

class RateLimiter {
  constructor() {
    this.limiters = new Map();
    this._initLimiters();
  }

  _initLimiters() {
    this.limiters.set('global', new RateLimiterMemory({
      points: config.rateLimit.points,
      duration: config.rateLimit.duration,
    }));

    this.limiters.set('clone', new RateLimiterMemory({
      points: 1,
      duration: config.rateLimit.cloneCooldown,
    }));

    this.limiters.set('generate', new RateLimiterMemory({
      points: 1,
      duration: config.rateLimit.generateCooldown,
    }));

    this.limiters.set('backup', new RateLimiterMemory({
      points: 3,
      duration: 3600,
    }));

    this.limiters.set('ai', new RateLimiterMemory({
      points: 10,
      duration: 60,
    }));
  }

  async consume(type, userId) {
    const limiter = this.limiters.get(type);
    if (!limiter) throw new Error(`Unknown rate limit type: ${type}`);

    try {
      const result = await limiter.consume(userId);
      return { allowed: true, remainingPoints: result.remainingPoints, msBeforeNext: result.msBeforeNext };
    } catch (err) {
      const waitSeconds = Math.ceil(err.msBeforeNext / 1000);
      log.warn(`Rate limit hit`, { type, userId, waitSeconds });
      return {
        allowed: false,
        remainingPoints: 0,
        msBeforeNext: err.msBeforeNext,
        waitSeconds,
        message: this._getMessage(type, waitSeconds),
      };
    }
  }

  async check(type, userId) {
    const limiter = this.limiters.get(type);
    if (!limiter) return { allowed: true };

    try {
      const result = await limiter.get(userId);
      if (!result) return { allowed: true, remainingPoints: limiter.points };
      const allowed = result.remainingPoints > 0;
      return {
        allowed,
        remainingPoints: result.remainingPoints,
        msBeforeNext: result.msBeforeNext,
        waitSeconds: allowed ? 0 : Math.ceil(result.msBeforeNext / 1000),
      };
    } catch {
      return { allowed: true };
    }
  }

  async reset(type, userId) {
    const limiter = this.limiters.get(type);
    if (limiter) {
      await limiter.delete(userId);
      log.info(`Rate limit reset`, { type, userId });
    }
  }

  _getMessage(type, waitSeconds) {
    const minutes = Math.ceil(waitSeconds / 60);
    const messages = {
      clone: `⏱️ Server cloning has a cooldown. Try again in **${minutes} minute${minutes !== 1 ? 's' : ''}**.`,
      generate: `⏱️ AI generation has a cooldown. Try again in **${minutes} minute${minutes !== 1 ? 's' : ''}**.`,
      backup: `⏱️ Backup limit reached. Try again in **${minutes} minute${minutes !== 1 ? 's' : ''}**.`,
      global: `⏱️ You're sending commands too fast. Slow down and try again in **${waitSeconds}s**.`,
      ai: `⏱️ AI request limit reached. Try again in **${waitSeconds}s**.`,
    };
    return messages[type] || `⏱️ Rate limit hit. Try again in **${waitSeconds}s**.`;
  }
}

module.exports = new RateLimiter();
