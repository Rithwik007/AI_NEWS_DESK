const mongoose = require('mongoose');

/**
 * Article schema — represents a single news article from an RSS feed.
 *
 * Key fields:
 * - url: unique index prevents storing exact same article on re-runs
 * - embedding: 384-dim vector from all-MiniLM-L6-v2 (title + snippet)
 * - clusterId: groups articles about the same story across sources
 * - isPrimary: true for the "representative" article in each cluster
 *   (earliest publishedAt, or longest snippet on tie)
 */
const articleSchema = new mongoose.Schema({
  source: {
    type: String,
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  url: {
    type: String,
    required: true,
    unique: true, // Prevents exact duplicate URLs on re-runs
  },
  publishedAt: {
    type: Date,
    required: true,
  },
  snippet: {
    type: String,
    default: '',
  },
  // 384-dimensional embedding vector from title + snippet concatenation
  embedding: {
    type: [Number],
    default: [],
  },
  // UUID identifying which cluster this article belongs to
  clusterId: {
    type: String,
    default: null,
  },
  // True for the representative article in its cluster
  isPrimary: {
    type: Boolean,
    default: false,
  },
  // Step 3: Summarization & Reasoning fields (Groq LLM)
  summary: {
    type: String,
    default: null,
  },
  whyReadThis: {
    type: String,
    default: null,
  },
  summarizedAt: {
    type: Date,
    default: null,
  },
  selectedArticleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Article',
    default: null,
  },
  fetchedAt: {
    type: Date,
    default: Date.now,
  },
});

// Indexes for deduplication and clustering queries
articleSchema.index({ clusterId: 1 });
articleSchema.index({ isPrimary: 1 });

const Article = mongoose.model('Article', articleSchema);

module.exports = Article;
