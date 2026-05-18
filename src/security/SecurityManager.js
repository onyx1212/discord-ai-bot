const { createContextLogger } = require('../utils/Logger');
const config = require('../config');

const log = createContextLogger('Security');

const bannedUsers = new Set();

class SecurityManager {
  constructor() {
    this.suspiciousActivity = new Map();
    this.MAX_SUSPICIOUS_SCORE = 100;
    setInterval(() => this._decayScores(), 60 * 1000);
  }

  async checkUser(userId) {
    if (!userId) return { allowed: false, reason: 'No user ID' };

    if (bannedUsers.has(userId)) {
      return { allowed: false, reason: 'You are banned from using this bot.' };
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

    const missing = requiredPermissions.filter(perm => !member.permissions.has(perm));
    if (missing.length > 0) return { allowed: false, reason: `You are missing permissions: **${missing.join(', ')}**` };
    return { allowed: true };
  }

  async checkBotPermissions(guild, requiredPermissions = []) {
    const botMember = guild.members.me;
    if (!botMember) return { allowed: false, reason: 'Could not find bot in server' };

    const missing = requiredPermissions.filter(perm => !botMember.permissions.has(perm));
    if (missing.length > 0) return { allowed: false, reason: `I am missing permissions: **${missing.join(', ')}**` };
    return { allowed: true };
  }

  isOwner(userId) {
    return userId === config.discord.ownerId;
  }

  flagSuspicious(userId, points = 10, reason = 'unknown') {
    const current = this.suspiciousActivity.get(userId) || { points: 0, reasons: [], lastAt: Date.now() };
    current.points += points;
    current.reasons.push(reason);
    current.lastAt = Date.now();
    this.suspiciousActivity.set(userId, current);
  }

  sanitizeInput(input, options = {}) {
    if (!input || typeof input !== 'string') return '';
    let clean = input.replace(/\u0000/g, '').replace(/[\u200B-\u200D\uFEFF]/g, '');
    if (options.maxLength) clean = clean.slice(0, options.maxLength);
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
      .replace(/(Bearer [a-zA-Z0-9._-]{20,})/g, 'Bearer [REDACTED]');
  }

  _decayScores() {
    const now = Date.now();
    for (const [userId, data] of this.suspiciousActivity.entries()) {
      if (now - data.lastAt > 5 * 60 * 1000) {
        data.points = Math.max(0, data.points - 20);
        if (data.points === 0) this.suspiciousActivity.delete(userId);
        else this.suspiciousActivity.set(userId, data);
      }
    }
  }
}

module.exports = new SecurityManager();
