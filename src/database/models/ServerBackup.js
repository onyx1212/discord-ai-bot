const mongoose = require('mongoose');

const permissionOverwriteSchema = new mongoose.Schema({
  id: String,
  type: Number,
  allow: String,
  deny: String,
}, { _id: false });

const channelSchema = new mongoose.Schema({
  originalId: String,
  name: String,
  type: Number,
  position: Number,
  topic: String,
  nsfw: { type: Boolean, default: false },
  rateLimitPerUser: { type: Number, default: 0 },
  bitrate: Number,
  userLimit: Number,
  parentId: String,
  permissionOverwrites: [permissionOverwriteSchema],
  defaultAutoArchiveDuration: Number,
  availableTags: [{ name: String, emoji: String, moderated: Boolean }],
}, { _id: false });

const categorySchema = new mongoose.Schema({
  originalId: String,
  name: String,
  position: Number,
  permissionOverwrites: [permissionOverwriteSchema],
  channels: [channelSchema],
}, { _id: false });

const roleSchema = new mongoose.Schema({
  originalId: String,
  name: String,
  color: Number,
  hoist: { type: Boolean, default: false },
  mentionable: { type: Boolean, default: false },
  permissions: String,
  position: Number,
  icon: String,
  unicodeEmoji: String,
}, { _id: false });

const emojiSchema = new mongoose.Schema({
  originalId: String,
  name: String,
  imageURL: String,
  animated: { type: Boolean, default: false },
  roles: [String],
}, { _id: false });

const stickerSchema = new mongoose.Schema({
  originalId: String,
  name: String,
  description: String,
  tags: String,
  imageURL: String,
}, { _id: false });

const autoModRuleSchema = new mongoose.Schema({
  name: String,
  eventType: Number,
  triggerType: Number,
  triggerMetadata: mongoose.Schema.Types.Mixed,
  actions: [mongoose.Schema.Types.Mixed],
  enabled: Boolean,
  exemptRoles: [String],
  exemptChannels: [String],
}, { _id: false });

const serverBackupSchema = new mongoose.Schema({
  backupId: { type: String, required: true, unique: true, index: true },
  guildId: { type: String, required: true, index: true },
  guildName: String,
  createdBy: { type: String, required: true },
  type: { type: String, enum: ['manual', 'auto', 'clone', 'pre-clone'], default: 'manual' },

  guild: {
    name: String,
    description: String,
    icon: String,
    banner: String,
    splash: String,
    discoverySplash: String,
    verificationLevel: Number,
    defaultMessageNotifications: Number,
    explicitContentFilter: Number,
    preferredLocale: String,
    afkChannelId: String,
    afkTimeout: Number,
    systemChannelId: String,
    systemChannelFlags: Number,
    rulesChannelId: String,
    publicUpdatesChannelId: String,
    features: [String],
    premiumTier: Number,
    nsfwLevel: Number,
  },

  roles: [roleSchema],
  categories: [categorySchema],
  channels: [channelSchema],
  emojis: [emojiSchema],
  stickers: [stickerSchema],
  autoModRules: [autoModRuleSchema],

  metadata: {
    totalRoles: { type: Number, default: 0 },
    totalChannels: { type: Number, default: 0 },
    totalEmojis: { type: Number, default: 0 },
    totalStickers: { type: Number, default: 0 },
    backupSizeMb: Number,
    discordVersion: String,
  },

  expiresAt: { type: Date, index: { expireAfterSeconds: 0 } },
  isPublic: { type: Boolean, default: false },
  tags: [String],
  notes: String,

}, {
  timestamps: true,
  versionKey: false,
});

serverBackupSchema.index({ guildId: 1, createdAt: -1 });
serverBackupSchema.index({ createdBy: 1 });
serverBackupSchema.index({ isPublic: 1 });

module.exports = mongoose.model('ServerBackup', serverBackupSchema);
