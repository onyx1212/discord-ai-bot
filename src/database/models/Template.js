const mongoose = require('mongoose');

const templateSchema = new mongoose.Schema({
  templateId: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  description: String,
  category: {
    type: String,
    enum: ['gaming', 'community', 'business', 'education', 'art', 'music', 'esports', 'anime', 'tech', 'other'],
    default: 'other',
  },
  tags: [String],
  isPublic: { type: Boolean, default: true },
  isOfficial: { type: Boolean, default: false },
  createdBy: String,

  uses: { type: Number, default: 0 },
  rating: { type: Number, default: 0, min: 0, max: 5 },
  ratings: [{
    userId: String,
    score: Number,
    createdAt: { type: Date, default: Date.now },
  }],

  prompt: String,
  aiGenerated: { type: Boolean, default: false },
  aiModel: String,

  structure: {
    name: String,
    description: String,
    verificationLevel: Number,
    roles: [mongoose.Schema.Types.Mixed],
    categories: [mongoose.Schema.Types.Mixed],
    channels: [mongoose.Schema.Types.Mixed],
    emojis: [mongoose.Schema.Types.Mixed],
  },

  preview: {
    imageUrl: String,
    channelCount: Number,
    roleCount: Number,
    categoryCount: Number,
    emojiCount: Number,
  },

}, {
  timestamps: true,
  versionKey: false,
});

templateSchema.index({ category: 1, isPublic: 1 });
templateSchema.index({ tags: 1 });
templateSchema.index({ uses: -1 });
templateSchema.index({ rating: -1 });

templateSchema.methods.addRating = async function (userId, score) {
  const existing = this.ratings.find(r => r.userId === userId);
  if (existing) {
    existing.score = score;
  } else {
    this.ratings.push({ userId, score });
  }
  this.rating = this.ratings.reduce((sum, r) => sum + r.score, 0) / this.ratings.length;
  return this.save();
};

module.exports = mongoose.model('Template', templateSchema);
