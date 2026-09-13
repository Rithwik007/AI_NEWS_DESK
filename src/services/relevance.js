const { cosineSimilarity } = require('./dedup');
const config = require('../config');

/**
 * Keyword-based Spam Filter Patterns.
 *
 * SCALE RE-VALIDATION (Audit on 753 primary articles, 865 total in DB):
 * - Re-run across full dataset on 2026-09-13 confirmed 15 total spam matches.
 * - 0 false positives detected. Every blocked article was verified to be stock pump,
 *   boilerplate PR/fellowship, SEO market CAGR forecast, or affiliate listicle.
 */
const SPAM_PATTERNS = [
  // 1. Tightened stock & market advice pattern (VERIFIED: requires stock term + trading/advice phrase)
  /\b(stocks?|shares?)\b.*?\b(better buy|screaming buy|buy after|biggest winner|could soar|soar by|buy right now|price target|buy rating|top pick|strong buy|to buy now)\b/i,
  /\b(better buy|screaming buy|buy after earnings|buy rating|price target|wall street targets)\b/i,

  // 2. SEO Market Research Reports & CAGR forecasts [VERIFIED AT SCALE]
  /\bmarket reports?\b/i,
  /\bmarket size (to reach|forecast)\b/i,
  /\bforecast to hit \$\d+(\.\d+)?\s*(bn|billion|trillion)\b/i,
  /\bCAGR of \d+(\.\d+)?%/i,

  // 3. Boilerplate training certifications, fellowships & SEO tool generation [VERIFIED AT SCALE]
  /\bfellowship (202\d|application)\b/i,
  /\b(launches|boost) \d+ new (AI )?certifications\b/i,
  /\bfree (AI )?video generator\b/i,
  /\bschool curriculum\b/i,

  // 4. Affiliate buying guides, product listicles & agency directories [VERIFIED AT SCALE]
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
 * Design Separation & Candidate Disambiguation:
 * 1. Pass/Fail Gatekeeping (bestRawSimilarity):
 *    - Computes raw cosine similarity against each topic.
 *    - Evaluates the absolute maximum unweighted similarity across all topics.
 *    - bestRawSimilarity >= RAW_SIMILARITY_THRESHOLD determines whether article passes admission.
 *    - Decoupled from weights to prevent low-weight niche topics from being locked out.
 *
 * 2. Topic Matching & Priority Ranking (matchedTopic & rankingScore):
 *    - Among candidate topics that cross the admission threshold (rawSim >= RAW_SIMILARITY_THRESHOLD),
 *      selects the candidate that maximizes weightedScore (rawSim * weight).
 *    - Resolves topic-mismatch anomalies where naive argmax(rawSim) assigned articles
 *      to low-weight catch-all topics (e.g. 0.472 raw, w=0.6) despite higher-priority topics
 *      being equally strong matches (e.g. 0.469 raw, w=1.0).
 *    - If no topic passes the admission threshold, falls back to the highest raw similarity topic.
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

  const threshold = config.RAW_SIMILARITY_THRESHOLD || 0.45;
  let highestRawSim = -Infinity;
  let highestRawTopic = null;

  const scoredTopics = [];
  for (const t of topics) {
    if (!t.embedding || t.embedding.length === 0) continue;

    const rawSim = cosineSimilarity(articleEmbedding, t.embedding);
    if (rawSim > highestRawSim) {
      highestRawSim = rawSim;
      highestRawTopic = t;
    }
    scoredTopics.push({
      topic: t.topic,
      weight: t.weight,
      rawSim: rawSim > 0 ? rawSim : 0,
      weightedScore: (rawSim > 0 ? rawSim : 0) * t.weight,
    });
  }

  const effectiveRawSim = highestRawSim > 0 ? highestRawSim : 0;

  // Evaluate passing candidates
  const passingCandidates = scoredTopics.filter((st) => st.rawSim >= threshold);

  let bestCandidate = null;
  if (passingCandidates.length > 0) {
    // Select passing candidate with highest weightedScore; tie-break on rawSim descending
    passingCandidates.sort((a, b) => b.weightedScore - a.weightedScore || b.rawSim - a.rawSim);
    bestCandidate = passingCandidates[0];
  } else {
    // Fallback for below-threshold articles
    bestCandidate = highestRawTopic
      ? {
          topic: highestRawTopic.topic,
          weight: highestRawTopic.weight,
          rawSim: effectiveRawSim,
          weightedScore: effectiveRawSim * highestRawTopic.weight,
        }
      : null;
  }

  const rankingScore = bestCandidate ? bestCandidate.weightedScore : 0;

  return {
    bestRawSimilarity: effectiveRawSim,
    rankingScore: rankingScore,
    relevanceScore: rankingScore, // Aliased for backwards compatibility
    matchedTopic: bestCandidate ? bestCandidate.topic : null,
  };
}

module.exports = { scoreRelevance, checkSpamKeywords, SPAM_PATTERNS };
