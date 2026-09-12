const mongoose = require('mongoose');

/**
 * ArticleRelevance schema — stores per-user relevance scoring, classification,
 * and Telegram delivery state for each article.
 *
 * Separation of concerns:
 * - Article: stores immutable global content, embedding, and LLM summary.
 * - ArticleRelevance: stores individual user's similarity, score, matched topic,
 *   confidence tier, and independent delivery status.
 */
const articleRelevanceSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true, // clerkUserId
    index: true,
  },
  articleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Article',
    required: true,
    index: true,
  },
  bestRawSimilarity: {
    type: Number,
    default: null,
  },
  rankingScore: {
    type: Number,
    default: null,
  },
  matchedTopic: {
    type: String,
    default: null,
  },
  isRelevant: {
    type: Boolean,
    default: false,
  },
  filteredReason: {
    type: String,
    default: null,
  },
  confidenceTier: {
    type: String,
    enum: ['high', 'moderate', 'low', null],
    default: null,
  },
  deliveryStatus: {
    type: String,
    enum: ['delivered', 'failed', 'expired', null],
    default: null,
  },
  deliveredAt: {
    type: Date,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Unique compound index: one relevance record per user per article
articleRelevanceSchema.index({ articleId: 1, userId: 1 }, { unique: true });

// Performance index for top-5 delivery queries
articleRelevanceSchema.index({ userId: 1, deliveryStatus: 1, rankingScore: -1 });

const ArticleRelevance = mongoose.model('ArticleRelevance', articleRelevanceSchema);

module.exports = ArticleRelevance;
