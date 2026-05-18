const NodeCache = require('node-cache');
const config = require('../config');
const { createContextLogger } = require('../utils/Logger');

const log = createContextLogger('Cache');

class CacheSystem {
  constructor() {
    this.caches = {
      guild: new NodeCache({ stdTTL: config.performance.cacheTtl, checkperiod: 60, useClones: false }),
      user: new NodeCache({ stdTTL: 120, checkperiod: 30, useClones: false }),
      invite: new NodeCache({ stdTTL: 60, checkperiod: 30 }),
      aiResult: new NodeCache({ stdTTL: 300, checkperiod: 60 }),
      template: new NodeCache({ stdTTL: 600, checkperiod: 120 }),
      rateLimit: new NodeCache({ stdTTL: 3600, checkperiod: 300 }),
    };

    this.stats = { hits: 0, misses: 0, sets: 0, deletes: 0 };

    for (const [name, cache] of Object.entries(this.caches)) {
      cache.on('del', (key) => {
        log.debug(`Cache evicted`, { cache: name, key });
      });
      cache.on('expired', (key) => {
        log.debug(`Cache expired`, { cache: name, key });
      });
    }
  }

  get(namespace, key) {
    const cache = this.caches[namespace];
    if (!cache) return null;

    const value = cache.get(String(key));
    if (value !== undefined) {
      this.stats.hits++;
      return value;
    }
    this.stats.misses++;
    return null;
  }

  set(namespace, key, value, ttl) {
    const cache = this.caches[namespace];
    if (!cache) return false;

    const success = ttl !== undefined
      ? cache.set(String(key), value, ttl)
      : cache.set(String(key), value);

    if (success) this.stats.sets++;
    return success;
  }

  del(namespace, key) {
    const cache = this.caches[namespace];
    if (!cache) return;
    cache.del(String(key));
    this.stats.deletes++;
  }

  flush(namespace) {
    if (namespace) {
      const cache = this.caches[namespace];
      if (cache) cache.flushAll();
    } else {
      for (const cache of Object.values(this.caches)) {
        cache.flushAll();
      }
    }
    log.info('Cache flushed', { namespace: namespace || 'all' });
  }

  getGuild(guildId) {
    return this.get('guild', guildId);
  }

  setGuild(guildId, data, ttl) {
    return this.set('guild', guildId, data, ttl);
  }

  getUser(userId) {
    return this.get('user', userId);
  }

  setUser(userId, data, ttl) {
    return this.set('user', userId, data, ttl);
  }

  getInvite(inviteCode) {
    return this.get('invite', inviteCode);
  }

  setInvite(inviteCode, data) {
    return this.set('invite', inviteCode, data);
  }

  getAIResult(promptHash) {
    return this.get('aiResult', promptHash);
  }

  setAIResult(promptHash, data) {
    return this.set('aiResult', promptHash, data);
  }

  getStats() {
    const cacheStats = {};
    for (const [name, cache] of Object.entries(this.caches)) {
      const stats = cache.getStats();
      cacheStats[name] = {
        keys: cache.keys().length,
        hits: stats.hits,
        misses: stats.misses,
        ksize: stats.ksize,
        vsize: stats.vsize,
      };
    }
    return { ...this.stats, caches: cacheStats };
  }
}

module.exports = new CacheSystem();
