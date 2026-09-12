/**
 * Dynamic Best-Article Selection per Cluster.
 *
 * Chooses the best article in a cluster for LLM summarization.
 * Evaluates:
 * 1. Snippet length and informative content (50%)
 * 2. Source quality / editorial depth tier (30%)
 * 3. Text cleanliness / non-truncation (20%)
 *
 * Fallback / Tiebreaker: prefers isPrimary if scores are tied or close.
 */

// Source quality tier weights
const SOURCE_TIERS = {
  // Tier 1: Direct primary blogs & top-tier tech journalism
  TIER_1: {
    weight: 30,
    patterns: [
      /techcrunch/i,
      /venturebeat/i,
      /technology review/i,
      /the guardian/i,
      /the verge/i,
      /wired/i,
      /ars technica/i,
      /reuters/i,
      /bloomberg/i,
      /openai/i,
      /deepmind/i,
      /meta ai/i,
      /hugging face/i,
    ],
  },
  // Tier 2: Reputable mainstream / business journalism
  TIER_2: {
    weight: 15,
    patterns: [
      /indian express/i,
      /cnbc/i,
      /bbc/i,
      /yahoo finance/i,
      /forbes/i,
      /business insider/i,
      /wsj/i,
      /financial times/i,
    ],
  },
  // Tier 3: Aggregators / community feeds (baseline 0)
  TIER_3: {
    weight: 0,
    patterns: [/google news/i, /reddit/i, /hacker news/i],
  },
};

/**
 * Extract publication outlet name from article source or title.
 * Google News formats titles as: "Headline text - Publisher Name"
 */
function extractOutlet(source = '', title = '') {
  let outlet = source;
  if (source.toLowerCase().includes('google news') && title.includes(' - ')) {
    const parts = title.split(' - ');
    outlet = parts[parts.length - 1].trim();
  }
  return outlet;
}

/**
 * Get source quality bonus for an article.
 * Matches specifically against the publication outlet, not the entire headline.
 *
 * @param {string} outlet
 * @returns {number}
 */
function getSourceScore(outlet = '') {
  const clean = outlet.toLowerCase();

  for (const pattern of SOURCE_TIERS.TIER_1.patterns) {
    if (pattern.test(clean)) return SOURCE_TIERS.TIER_1.weight;
  }
  for (const pattern of SOURCE_TIERS.TIER_2.patterns) {
    if (pattern.test(clean)) return SOURCE_TIERS.TIER_2.weight;
  }
  return SOURCE_TIERS.TIER_3.weight;
}

/**
 * Score a single candidate article for summarization suitability.
 *
 * @param {Object} article
 * @returns {Object} { score: number, breakdown: Object }
 */
function scoreArticleQuality(article) {
  const title = (article.title || '').trim();
  const snippet = (article.snippet || '').trim();
  const source = (article.source || '').trim();
  const outlet = extractOutlet(source, title);

  let lengthScore = 0;
  let cleanlinessScore = 0;
  let penalty = 0;

  // 1. Length & Informativeness (max 50 pts)
  const snippetLen = snippet.length;
  lengthScore = Math.min(snippetLen / 300, 1.0) * 50;

  // Penalty if snippet is basically an identical echo of title
  if (snippet && title && snippet.toLowerCase().startsWith(title.toLowerCase().slice(0, 25))) {
    if (snippetLen < title.length + 15) {
      penalty += 20; // Repetitive title echo without body substance
    }
  }

  // Penalty if snippet is very brief (< 40 chars)
  if (snippetLen < 40) {
    penalty += 25;
  }

  // Penalty if title or snippet ends with ".." or "..." indicating cut-off headline mid-word
  if (title.endsWith('..') || title.includes('.. -') || snippet.endsWith('..')) {
    penalty += 25;
  }

  // Penalty if publisher or title contains non-Latin scripts (e.g. Korean, Chinese, Japanese) in English feed
  const nonLatinMatch = `${outlet} ${title} ${snippet}`.match(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/g);
  if (nonLatinMatch && nonLatinMatch.length >= 2) {
    penalty += 35;
  }

  // 2. Source Tier (max 30 pts)
  const sourceScore = getSourceScore(outlet);

  // 3. Cleanliness & Structure (max 20 pts)
  if (snippet.endsWith('.') || snippet.endsWith('!') || snippet.endsWith('?')) {
    cleanlinessScore += 10;
  }
  if (snippet.includes('. ') || snippet.includes('? ') || snippet.includes('! ')) {
    cleanlinessScore += 10;
  }

  const totalScore = Math.max(0, lengthScore + sourceScore + cleanlinessScore - penalty);

  return {
    score: totalScore,
    breakdown: {
      outlet,
      lengthScore,
      sourceScore,
      cleanlinessScore,
      penalty,
    },
  };
}

/**
 * Select the single best article from a cluster for summarization.
 *
 * @param {Array<Object>} articles - All articles belonging to the cluster
 * @returns {Object} { selectedArticle, isDifferentFromPrimary, candidateScores }
 */
function selectBestArticleForSummary(articles) {
  if (!articles || articles.length === 0) {
    return { selectedArticle: null, isDifferentFromPrimary: false, candidateScores: [] };
  }

  if (articles.length === 1) {
    return {
      selectedArticle: articles[0],
      isDifferentFromPrimary: false,
      candidateScores: [{ articleId: articles[0]._id, score: 100 }],
    };
  }

  const primaryArticle = articles.find((a) => a.isPrimary) || articles[0];

  const scored = articles.map((a) => {
    const { score, breakdown } = scoreArticleQuality(a);
    return {
      article: a,
      score,
      breakdown,
      isPrimary: !!a.isPrimary,
    };
  });

  // Sort descending by score
  scored.sort((a, b) => b.score - a.score);

  const highestCandidate = scored[0];
  const primaryCandidate = scored.find((s) => s.isPrimary) || scored[0];

  // If highest candidate beats primary by at least 5 points, select highest.
  // Otherwise, default to primary to avoid churn on negligible score differences.
  let selected = primaryCandidate.article;
  let isDifferent = false;

  if (highestCandidate.article._id?.toString() !== primaryCandidate.article._id?.toString()) {
    if (highestCandidate.score > primaryCandidate.score + 5) {
      selected = highestCandidate.article;
      isDifferent = true;
    }
  }

  return {
    selectedArticle: selected,
    isDifferentFromPrimary: isDifferent,
    candidateScores: scored.map((s) => ({
      articleId: s.article._id,
      title: s.article.title,
      source: s.article.source,
      score: s.score,
      isPrimary: s.isPrimary,
      breakdown: s.breakdown,
    })),
  };
}

module.exports = {
  selectBestArticleForSummary,
  scoreArticleQuality,
  getSourceScore,
};
