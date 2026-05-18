const Joi = require('joi');
const { createContextLogger } = require('./Logger');

const log = createContextLogger('Validator');

const DISCORD_INVITE_PATTERNS = [
  /^https?:\/\/discord\.gg\/([a-zA-Z0-9-]+)$/,
  /^https?:\/\/discord\.com\/invite\/([a-zA-Z0-9-]+)$/,
  /^discord\.gg\/([a-zA-Z0-9-]+)$/,
  /^([a-zA-Z0-9-]{2,10})$/,
];

const DISCORD_ID_PATTERN = /^\d{17,19}$/;

class Validator {
  static isDiscordId(value) {
    return DISCORD_ID_PATTERN.test(String(value));
  }

  static isDiscordInvite(value) {
    if (!value || typeof value !== 'string') return false;
    return DISCORD_INVITE_PATTERNS.some(p => p.test(value.trim()));
  }

  static extractInviteCode(value) {
    if (!value) return null;
    const clean = value.trim();
    for (const pattern of DISCORD_INVITE_PATTERNS) {
      const match = clean.match(pattern);
      if (match) return match[1] || match[0];
    }
    return null;
  }

  static sanitizeText(text, maxLength = 2000) {
    if (!text || typeof text !== 'string') return '';
    return text
      .replace(/[<>@&]/g, m => ({ '<': '&lt;', '>': '&gt;', '@': '@\u200b', '&': '&amp;' }[m]))
      .slice(0, maxLength)
      .trim();
  }

  static sanitizeChannelName(name) {
    if (!name) return 'channel';
    return name
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 100) || 'channel';
  }

  static sanitizeRoleName(name) {
    if (!name) return 'Role';
    return name.replace(/[^\w\s-]/g, '').slice(0, 100).trim() || 'Role';
  }

  static isValidPrompt(prompt) {
    if (!prompt || typeof prompt !== 'string') return { valid: false, error: 'Prompt must be a string' };
    const trimmed = prompt.trim();
    if (trimmed.length < 5) return { valid: false, error: 'Prompt is too short (minimum 5 characters)' };
    if (trimmed.length > 500) return { valid: false, error: 'Prompt is too long (maximum 500 characters)' };
    const banned = ['token', 'hack', 'exploit', 'ddos', 'phishing', 'malware', 'scam'];
    const lower = trimmed.toLowerCase();
    const found = banned.find(b => lower.includes(b));
    if (found) return { valid: false, error: `Prompt contains prohibited content: "${found}"` };
    return { valid: true };
  }

  static validateServerTarget(input) {
    if (!input) return { valid: false, error: 'Server target is required' };
    const clean = input.trim();
    if (this.isDiscordId(clean)) return { valid: true, type: 'id', value: clean };
    if (this.isDiscordInvite(clean)) {
      const code = this.extractInviteCode(clean);
      if (code) return { valid: true, type: 'invite', value: code };
    }
    return { valid: false, error: 'Invalid server ID or invite link. Use a valid Discord invite (discord.gg/xxx) or server ID.' };
  }

  static validateAIResponse(response) {
    if (!response || typeof response !== 'object') return { valid: false, error: 'AI response is not an object' };

    const schema = Joi.object({
      name: Joi.string().max(100).required(),
      description: Joi.string().max(1024).optional().allow(''),
      icon: Joi.string().optional().allow(null, ''),
      verificationLevel: Joi.number().integer().min(0).max(4).optional(),
      roles: Joi.array().items(
        Joi.object({
          name: Joi.string().max(100).required(),
          color: Joi.string().optional().allow(null, ''),
          permissions: Joi.string().optional(),
          hoist: Joi.boolean().optional(),
          mentionable: Joi.boolean().optional(),
          position: Joi.number().integer().optional(),
        })
      ).max(100).optional(),
      categories: Joi.array().items(
        Joi.object({
          name: Joi.string().max(100).required(),
          position: Joi.number().integer().optional(),
          channels: Joi.array().items(
            Joi.object({
              name: Joi.string().max(100).required(),
              type: Joi.string().valid('text', 'voice', 'stage', 'forum', 'announcement', 'thread').optional(),
              topic: Joi.string().max(1024).optional().allow(''),
              nsfw: Joi.boolean().optional(),
              slowmode: Joi.number().integer().min(0).max(21600).optional(),
              position: Joi.number().integer().optional(),
              permissionOverwrites: Joi.array().optional(),
            })
          ).max(50).optional(),
        })
      ).max(50).optional(),
    }).unknown(true);

    const { error } = schema.validate(response);
    if (error) {
      log.warn('AI response validation failed', { error: error.message });
      return { valid: false, error: error.message };
    }
    return { valid: true };
  }
}

module.exports = Validator;
