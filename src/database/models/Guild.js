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
  nsfw: Boolean,
  rateLimitPerUser: Number,
  bitrate: Number,
  userLimit: Number,
  parentId: String,
  permissionOverwrites: [permissionOverwriteSchema],
}, { _id: false });

const roleSchema = new mongoose.Schema({
  originalId: String,
  name: String,
  color: Number,
  hoist: Boolean,
  mentionable: Boolean,
  permissions: String,
  position: Number,
  icon: String,
  unicodeEmoji: String,
}, { _id: false });

const guildSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true, index: true },
  name: String,
  ownerId: String,

  config: {
    prefix: { type: String, default: '!' },
    language: { type: String, default: 'en' },
    timezone: { type: String, default: 'UTC' },
    logChannelId: String,
    adminRoleId: String,
    modRoleId: String,
    welcomeChannelId: String,
    welcomeMessage: String,
    autoRole: String,
    verificationChannelId: String,
    ticketCategoryId: String,
  },

  premium: {
    enabled: { type: Boolean, default: false },
    expiresAt: Date,
    tier: { type: String, enum: ['free', 'basic', 'pro', 'enterprise'], default: 'free' },
  },

  stats: {
    clonesPerformed: { type: Number, default: 0 },
    serversGenerated: { type: Number, default: 0 },
    backupsCreated: { type: Number, default: 0 },
    lastActivity: Date,
  },

  cloneHistory: [{
    sourceGuildId: String,
    sourceGuildName: String,
    performedBy: String,
    completedAt: { type: Date, default: Date.now },
    success: Boolean,
    channelsCloned: Number,
    rolesCloned: Number,
    emojisCloned: Number,
  }],

  generateHistory: [{
    prompt: String,
    performedBy: String,
    completedAt: { type: Date, default: Date.now },
    success: Boolean,
    model: String,
  }],

  backup: {
    roles: [roleSchema],
    channels: [channelSchema],
    name: String,
    icon: String,
    banner: String,
    description: String,
    verificationLevel: Number,
    defaultMessageNotifications: Number,
    explicitContentFilter: Number,
    afkChannelId: String,
    afkTimeout: Number,
    systemChannelId: String,
    backedUpAt: Date,
  },

}, {
  timestamps: true,
  versionKey: false,
});

guildSchema.statics.getOrCreate = async function (guildId, name) {
  let guild = await this.findOne({ guildId });
  if (!guild) {
    guild = await this.create({ guildId, name });
  }
  return guild;
};

guildSchema.methods.incrementStat = function (stat) {
  this.stats[stat] = (this.stats[stat] || 0) + 1;
  this.stats.lastActivity = new Date();
  return this.save();
};

module.exports = mongoose.model('Guild', guildSchema);
