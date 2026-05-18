const config = require('../config');
const { createContextLogger } = require('../utils/Logger');
const User = require('../database/models/User');

const log = createContextLogger('Security');

class SecurityManager {
  constructor() {
    this.suspiciousActivity = new Map();
    this.blockedIps = new Set();
    this.MAX_SUSPICIOUS_SCORE = 100;
    this.SUSPICIOUS_DECAY_MS = 60 * 1000;

    setInterval(() => this._decayScores(), this.SUSPICIOUS_DECAY_MS);
  }

  async checkUser(userId) {
    if (!userId) return { allowed: false, reason: 'No user ID' };

    try {
      const user = await User.findOne({ userId });
      if (user?.isBanned()) {
        return {
          allowed: false,
          reason: `You are banned from using this bot. Reason: ${user.banReason || 'No reason provided'}`,
        };
      }
    } catch (err) {
      log.error('Failed to check user ban status', { userId, error: err.message });
    }

    const score = this.suspiciousActivity.get(userId);
    if (score && score.points >= this.MAX_SUSPICIOUS_SCORE) {
      log.warn('Blocking suspicious user', { userId, score: score.points });
      return { allowed: false, reason: 'Suspicious activity detected. Please slow down.' };
    }

    return { allowed: true };
  }

  async checkPermissions(interaction, requiredPermissions = []) {
    const { member, guild } = interaction;
    if (!member || !guild) return { allowed: false, reason: 'Must be used in a server' };

    if (requiredPermissions.length === 0) return { allowed: true };

    const memberPerms = member.permissions;
    const missing = requiredPermissions.filter(perm => !memberPerms.has(perm));

    if (missing.length > 0) {
      return {
        allowed: false,
        reason: `You are missing permissions: **${missing.join(', ')}**`,
      };
    }

    return { allowed: true };
  }

  async checkBotPermissions(guild, requiredPermissions = []) {
    const botMember = guild.members.me;
    if (!botMember) return { allowed: false, reason: 'Could not find bot in server' };

    const missing = requiredPermissions.filter(perm => !botMember.permissions.has(perm));
    if (missing.length > 0) {
      return {
        allowed: false,
        reason: `I am missing permissions: **${missing.join(', ')}**. Please grant me these permissions and try again.`,
      };
    }

    return { allowed: true };
  }

  isOwner(userId) {
    return userId === config.discord.ownerId;
  }

  async isAdmin(userId, guild) {
    try {
      const member = await guild.members.fetch(userId);
      return member.permissions.has('Administrator');
    } catch {
      return false;
    }
  }

  flagSuspicious(userId, points = 10, reason = 'unknown') {
    const current = this.suspiciousActivity.get(userId) || { points: 0, reasons: [], firstAt: Date.now() };
    current.points += points;
    current.reasons.push(reason);
    current.lastAt = Date.now();
    this.suspiciousActivity.set(userId, current);

    if (current.points >= this.MAX_SUSPICIOUS_SCORE) {
      log.warn('User exceeded suspicious activity threshold', { userId, points: current.points, reasons: current.reasons });
    }
  }

  sanitizeInput(input, options = {}) {
    if (!input || typeof input !== 'string') return '';
    let clean = input;

    if (!options.allowMarkdown) {
      clean = clean.replace(/[*_`~|\\]/g, '\\$&');
    }

    clean = clean.replace(/\u0000/g, '').replace(/[\u200B-\u200D\uFEFF]/g, '');

    if (options.maxLength) {
      clean = clean.slice(0, options.maxLength);
    }

    return clean.trim();
  }

  maskToken(text) {
    if (!text) return text;
    return text.replace(/[A-Za-z0-9]{24}\.[A-Za-z0-9]{6}\.[A-Za-z0-9_-]{27,}/g, '[REDACTED_TOKEN]');
  }

  maskApiKey(text) {
    if (!text) return text;
    return text
      .replace(/(sk-[a-zA-Z0-9]{20,})/g, '[REDACTED_KEY]')
      .replace(/(Bearer [a-zA-Z0-9._-]{20,})/g, 'Bearer [REDACTED]')
      .replace(/(api[_-]?key[=:]\s*)[a-zA-Z0-9_-]+/gi, '$1[REDACTED]');
  }

  validateGuildManageable(guild) {
    const botMember = guild.members.me;
    if (!botMember) return { valid: false, reason: 'Bot is not in the server' };

    const highestBotRole = botMember.roles.highest;
    const everyonePosition = guild.roles.everyone.position;

    if (highestBotRole.position <= everyonePosition) {
      return { valid: false, reason: 'Bot has no roles above @everyone — cannot manage the server' };
    }

    return { valid: true };
  }

  _decayScores() {
    const now = Date.now();
    for (const [userId, data] of this.suspiciousActivity.entries()) {
      const age = now - data.lastAt;
      if (age > 5 * 60 * 1000) {
        data.points = Math.max(0, data.points - 20);
        if (data.points === 0) {
          this.suspiciousActivity.delete(userId);
        } else {
          this.suspiciousActivity.set(userId, data);
        }
      }
    }
  }
}

module.exports = new SecurityManager();
