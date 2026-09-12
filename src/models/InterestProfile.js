const mongoose = require('mongoose');

/**
 * InterestProfile schema — represents user's topical preferences and weights.
 *
 * Each topic contains:
 * - topic: Natural-language description of interest
 * - weight: 0.0 to 1.0 importance multiplier
 * - embedding: 384-dim vector generated with all-MiniLM-L6-v2
 */
const topicSchema = new mongoose.Schema({
  topic: {
    type: String,
    required: true,
  },
  weight: {
    type: Number,
    required: true,
    min: 0,
    max: 1,
  },
  embedding: {
    type: [Number],
    required: true,
  },
}, { _id: false });

const interestProfileSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true, // Unique per user (Clerk User ID)
  },
  topics: [topicSchema],
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

const InterestProfile = mongoose.model('InterestProfile', interestProfileSchema);

module.exports = InterestProfile;
