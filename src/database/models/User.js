const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true, index: true },
  username: String,
  discriminator: String,
  avatar: String,

  premium: {
    enabled: { type: Boolean, default: false },
    expiresAt: Date,
    tier: { type: String, enum: ['free', 'basic', 'pro', 'enterprise'], default: 'free' },
    grantedBy: String,
  },

  stats: {
    clonesTotal: { type: Number, default: 0 },
    generationsTotal: { type: Number, default: 0 },
    backupsTotal: { type: Number, default: 0 },
    commandsUsed: { type: Number, default: 0 },
    lastSeen: Date,
    joinedAt: Date,
  },

  preferences: {
    language: { type: String, default: 'en' },
    notifications: { type: Boolean, default: true },
    publicProfile: { type: Boolean, default: false },
  },

  cooldowns: {
    clone: Date,
    generate: Date,
    backup: Date,
  },

  banned: { type: Boolean, default: false },
  banReason: String,
  bannedBy: String,
  bannedAt: Date,

  warnings: [{
    reason: String,
    issuedBy: String,
    issuedAt: { type: Date, default: Date.now },
  }],

  aiMemory: [{
    guildId: String,
    prompt: String,
    summary: String,
    createdAt: { type: Date, default: Date.now },
  }],

}, {
  timestamps: true,
  versionKey: false,
});

userSchema.statics.getOrCreate = async function (userId, username) {
  let user = await this.findOne({ userId });
  if (!user) {
    user = await this.create({ userId, username, stats: { joinedAt: new Date(), lastSeen: new Date() } });
  } else {
    user.stats.lastSeen = new Date();
    if (username) user.username = username;
    await user.save();
  }
  return user;
};

userSchema.methods.isBanned = function () {
  return this.banned === true;
};

userSchema.methods.isPremium = function () {
  if (!this.premium.enabled) return false;
  if (this.premium.expiresAt && this.premium.expiresAt < new Date()) return false;
  return true;
};

userSchema.methods.incrementStat = function (stat) {
  this.stats[stat] = (this.stats[stat] || 0) + 1;
  this.stats.lastSeen = new Date();
  return this.save();
};

module.exports = mongoose.model('User', userSchema);
