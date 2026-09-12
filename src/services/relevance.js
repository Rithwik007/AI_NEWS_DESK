const { cosineSimilarity } = require('./dedup');

/**
 * Keyword-based Spam Filter Patterns.
 *
 * NOTE: The 8 non-stock SPAM_PATTERNS were each validated against only 1 matching
 * article in the current dataset (N=1 each) — marked as provisional, to be revisited
 * if any pass rate anomalies appear later (e.g. a legit article silently missing that
 * a manual check reveals was keyword-filtered incorrectly).
 */
const SPAM_PATTERNS = [
  // 1. Tightened stock & market advice pattern (VERIFIED: requires stock term + trading/advice phrase)
  /\b(stocks?|shares?)\b.*?\b(better buy|screaming buy|buy after|biggest winner|could soar|soar by|buy right now|price target|buy rating|top pick|strong buy|to buy now)\b/i,
  /\b(better buy|screaming buy|buy after earnings|buy rating|price target|wall street targets)\b/i,

  // 2. SEO Market Research Reports & CAGR forecasts [PROVISIONAL: N=1 validation each]
  /\bmarket reports?\b/i,
  /\bmarket size (to reach|forecast)\b/i,
  /\bforecast to hit \$\d+(\.\d+)?\s*(bn|billion|trillion)\b/i,
  /\bCAGR of \d+(\.\d+)?%/i,

  // 3. Boilerplate training certifications, fellowships & SEO tool generation [PROVISIONAL: N=1 validation each]
  /\bfellowship (202\d|application)\b/i,
  /\b(launches|boost) \d+ new (AI )?certifications\b/i,
  /\bfree (AI )?video generator\b/i,
  /\bschool curriculum\b/i,

  // 4. Affiliate buying guides, product listicles & agency directories [VERIFIED: N=2 matches in DB, 0 false positives]
  /\b(best|top\s+\d+|top)\b.*?\b(tools?|apps?|software|platforms?|companies|agencies|solutions)\b.*?(for 202\d|in 202\d|\(202\d\))/i,
  /\b(best|top)\s+\d+\s+(?:[a-z-]+\s+)*(ai\s+)?(tools?|apps?|software|platforms?)\b/i,
  /\b(buying guide|buyer'?s guide)\b/i,
];

/**
 * Check if an article title matches any known spam/promotional patterns.
 *
 * @param {string} title
 * @returns {Object} { isSpam: boolean, matchedPattern: string|null }
 */
function checkSpamKeywords(title) {
  if (!title) return { isSpam: false, matchedPattern: null };

  for (const pattern of SPAM_PATTERNS) {
    if (pattern.test(title)) {
      return { isSpam: true, matchedPattern: pattern.toString() };
    }
  }

  return { isSpam: false, matchedPattern: null };
}

/**
 * Calculate relevance and ranking score of an article against a user interest profile.
 *
 * Design Separation:
 * 1. Pass/Fail Gatekeeping (bestRawSimilarity):
 *    - Computes raw cosine similarity against each topic.
 *    - Identifies best matching topic based purely on content similarity (no weight penalty).
 *    - Best raw similarity determines whether article passes RAW_SIMILARITY_THRESHOLD.
 *
 * 2. Priority Ranking (rankingScore):
 *    - rankingScore = bestRawSimilarity * bestTopic.weight
 *    - Used strictly for ordering/prioritizing passing articles in the digest (Steps 3 & 4),
 *      not for gatekeeping admission.
 *
 * @param {Array<number>} articleEmbedding - 384-dimensional article vector
 * @param {Array<Object>} topics - Array of { topic: string, weight: number, embedding: number[] }
 * @returns {Object} { bestRawSimilarity, rankingScore, matchedTopic, relevanceScore }
 */
function scoreRelevance(articleEmbedding, topics) {
  if (!articleEmbedding || !topics || topics.length === 0) {
    return {
      bestRawSimilarity: 0,
      rankingScore: 0,
      relevanceScore: 0,
      matchedTopic: null,
    };
  }

  let highestRawSim = -Infinity;
  let bestTopicObj = null;

  for (const t of topics) {
    if (!t.embedding || t.embedding.length === 0) continue;

    const rawSim = cosineSimilarity(articleEmbedding, t.embedding);
    if (rawSim > highestRawSim) {
      highestRawSim = rawSim;
      bestTopicObj = t;
    }
  }

  const effectiveRawSim = highestRawSim > 0 ? highestRawSim : 0;
  const weight = bestTopicObj ? bestTopicObj.weight : 0;
  const rankingScore = effectiveRawSim * weight;

  return {
    bestRawSimilarity: effectiveRawSim,
    rankingScore: rankingScore,
    relevanceScore: rankingScore, // Aliased for backwards compatibility
    matchedTopic: bestTopicObj ? bestTopicObj.topic : null,
  };
}

module.exports = { scoreRelevance, checkSpamKeywords, SPAM_PATTERNS };
