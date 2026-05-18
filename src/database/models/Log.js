const mongoose = require('mongoose');

const logSchema = new mongoose.Schema({
  level: { type: String, enum: ['info', 'warn', 'error', 'debug'], default: 'info', index: true },
  event: { type: String, required: true, index: true },
  message: String,
  guildId: { type: String, index: true },
  userId: String,
  commandName: String,
  context: mongoose.Schema.Types.Mixed,
  error: {
    message: String,
    stack: String,
    code: String,
  },
  duration: Number,
  success: Boolean,
  aiProvider: { type: String, enum: ['openrouter', 'groq', 'none'] },
  aiModel: String,
  aiTokensUsed: Number,
  aiFallback: { type: Boolean, default: false },
}, {
  timestamps: true,
  versionKey: false,
});

logSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });
logSchema.index({ event: 1, guildId: 1 });
logSchema.index({ level: 1, createdAt: -1 });

logSchema.statics.logEvent = async function (data) {
  try {
    return await this.create(data);
  } catch {
    // Never let logging fail the main operation
  }
};

logSchema.statics.getGuildStats = async function (guildId, days = 7) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return this.aggregate([
    { $match: { guildId, createdAt: { $gte: since } } },
    { $group: { _id: '$event', count: { $sum: 1 }, lastSeen: { $max: '$createdAt' } } },
    { $sort: { count: -1 } },
  ]);
};

module.exports = mongoose.model('Log', logSchema);
