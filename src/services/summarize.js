const config = require('../config');
const { selectBestArticleForSummary } = require('./articleSelection');

/**
 * Sleep helper for rate limiting and backoff.
 *
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Clean and parse LLM response into JSON.
 * Strips accidental markdown fences (```json ... ```) or whitespace.
 *
 * @param {string} rawText
 * @returns {Object|null}
 */
function parseJsonSafe(rawText) {
  if (!rawText) return null;

  let cleaned = rawText.trim();
  // Strip markdown code fences if model accidentally wrapped output
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }

  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === 'object' && typeof parsed.summary === 'string' && typeof parsed.whyReadThis === 'string') {
      return {
        summary: parsed.summary.trim(),
        whyReadThis: parsed.whyReadThis.trim(),
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Determine relevance confidence tier from rankingScore.
 *
 * Tiers:
 * - "high" (>= 0.35): Direct alignment with core technical interests.
 * - "moderate" (0.25 - 0.35): Solid industry/tech news with general relevance.
 * - "low" (< 0.25): Peripheral or borderline match. Must be summarized conservatively.
 *
 * @param {number} rankingScore
 * @returns {string} "high" | "moderate" | "low"
 */
function getConfidenceTier(rankingScore = 0) {
  if (rankingScore >= 0.35) return 'high';
  if (rankingScore >= 0.25) return 'moderate';
  return 'low';
}

/**
 * Call Groq API to generate summary and whyReadThis for a single article.
 * Includes JSON enforcement, retry on parse error, and rate-limit backoff.
 * Adjusts prompt behavior based on confidenceTier to avoid overselling borderline matches.
 *
 * @param {Object} params
 * @param {string} params.title
 * @param {string} params.snippet
 * @param {string} params.source
 * @param {string} params.matchedTopic
 * @param {string} [params.confidenceTier='moderate']
 * @param {number} [params.rankingScore=null]
 * @param {number} [retryCount=0]
 * @returns {Promise<Object>} { summary, whyReadThis }
 */
async function callGroqSummarize(
  { title, snippet, source, matchedTopic, confidenceTier = 'moderate', rankingScore = null },
  retryCount = 0
) {
  if (!config.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is not set in environment or .env');
  }

  const endpoint = 'https://api.groq.com/openai/v1/chat/completions';

  let toneInstruction = '';
  if (confidenceTier === 'low') {
    toneInstruction = `CRITICAL HONESTY CONSTRAINT: The relevance confidence for this article is LOW / BORDERLINE (rankingScore: ${rankingScore !== null ? rankingScore.toFixed(3) : 'low'}).
- Do NOT invent, force, or hallucinate a connection to the user focus area that is not directly supported by the snippet.
- Do NOT oversell. Acknowledge what the article is ACTUALLY about honestly (e.g. "Primarily a general overview of...", "A peripheral look at...", "Relevant only if you want broader context on...").
- Acknowledge limitations of relevance rather than smoothing over them.`;
  } else if (confidenceTier === 'moderate') {
    toneInstruction = `MODERATE RELEVANCE: Frame the reason objectively around the broader context without exaggerating the connection.`;
  } else {
    toneInstruction = `HIGH RELEVANCE: Explain the direct practical relevance clearly and engagingly.`;
  }

  const systemPrompt = `You are a concise, expert AI news curator.
Your task is to generate a neutral 2-3 sentence summary of what the article actually reports, and a 1-2 sentence honest reason ("whyReadThis") for someone interested in AI technology.
Rules:
1. "summary": Exactly 2-3 neutral, factual sentences covering what the article reports based ONLY on the provided title and snippet. Do not invent or hallucinate unmentioned facts.
2. "whyReadThis": Exactly 1-2 conversational sentences explaining why this matters.
${toneInstruction}
NEVER use internal system jargon like "matchedTopic", "rankingScore", "similarity score", "algorithm", or "relevance gate".
3. Return ONLY a valid JSON object with keys "summary" and "whyReadThis". No markdown code blocks, no preamble, no postscript.`;

  const userPrompt = `Article to analyze:
Title: "${title}"
Source: "${source}"
Snippet: "${snippet || 'No additional snippet provided.'}"
Assigned Topic Area: "${matchedTopic || 'General Artificial Intelligence'}"
Relevance Level: ${confidenceTier.toUpperCase()} (rankingScore: ${rankingScore !== null ? rankingScore.toFixed(3) : 'N/A'})

Output JSON format:
{
  "summary": "...",
  "whyReadThis": "..."
}`;

  const requestBody = {
    model: config.GROQ_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.2, // Low temperature for factual precision
    response_format: { type: 'json_object' }, // Enforce valid JSON from Groq
  };

  if (retryCount > 0) {
    requestBody.messages.push({
      role: 'user',
      content: 'STRICT INSTRUCTION: Your previous response was invalid. Output ONLY valid JSON: {"summary": "...", "whyReadThis": "..."}',
    });
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.GROQ_API_KEY}`,
    },
    body: JSON.stringify(requestBody),
  });

  // Handle rate limits (HTTP 429)
  if (response.status === 429) {
    const retryAfterHeader = response.headers.get('retry-after');
    const parsedWait = retryAfterHeader ? parseFloat(retryAfterHeader) * 1000 : 3000;
    const waitTimeMs = Math.max(parsedWait, (retryCount + 1) * 3000);
    console.warn(`[Groq] Rate limit hit (429). Waiting ${waitTimeMs}ms before retry ${retryCount + 1}...`);
    await sleep(waitTimeMs);
    if (retryCount < 4) {
      return callGroqSummarize({ title, snippet, source, matchedTopic }, retryCount + 1);
    }
    throw new Error('Groq rate limit exceeded after retries');
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq API error HTTP ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const rawContent = data.choices?.[0]?.message?.content;
  const parsed = parseJsonSafe(rawContent);

  if (!parsed) {
    if (retryCount < 1) {
      console.warn(`[Groq] Malformed JSON response for "${title.slice(0, 40)}...". Retrying once...`);
      await sleep(1000);
      return callGroqSummarize({ title, snippet, source, matchedTopic }, retryCount + 1);
    }
    throw new Error(`Failed to parse valid JSON from Groq response: ${rawContent}`);
  }

  return parsed;
}

/**
 * Summarize all relevant clusters in MongoDB.
 *
 * For each relevant cluster:
 * 1. Queries all articles belonging to the cluster.
 * 2. Runs selectBestArticleForSummary heuristic.
 * 3. Logs when selected article != isPrimary.
 * 4. Calls Groq API to generate summary + whyReadThis.
 * 5. Saves summary, whyReadThis, summarizedAt, and selectedArticleId to the primary article doc.
 * 6. Rate limits calls with delay.
 *
 * @param {Object} [options]
 * @param {boolean} [options.dryRun=false] - If true, logs outputs without writing to DB
 * @param {number} [options.limit] - Max clusters to process (useful for testing)
 * @returns {Promise<Object>} Execution summary
 */
async function summarizeRelevantClusters(options = {}) {
  const Article = require('../models/Article');
  const ArticleRelevance = require('../models/ArticleRelevance');
  const startTime = Date.now();

  console.log('\n======================================================');
  console.log(`STEP 3: GROQ SUMMARIZATION & REASON GENERATION`);
  console.log(`Model: ${config.GROQ_MODEL}`);
  console.log(`Rate limit delay: ${config.GROQ_RATE_LIMIT_DELAY_MS}ms`);
  console.log('======================================================\n');

  // Query primary articles that passed relevance filtering for at least one user
  const relevantArticleIds = await ArticleRelevance.distinct('articleId', { isRelevant: true });

  const query = {
    _id: { $in: relevantArticleIds },
    isPrimary: true,
  };
  if (!options.forceAll) {
    query.summary = null;
  }

  let relevantPrimaries = await Article.find(query);
  if (options.limit && options.limit > 0) {
    relevantPrimaries = relevantPrimaries.slice(0, options.limit);
  }

  console.log(`[Summarize] Found ${relevantPrimaries.length} relevant clusters to process (forceAll: ${!!options.forceAll}).\n`);

  let successCount = 0;
  let failCount = 0;
  let selectionDifferences = 0;
  const failures = [];
  const sampleOutputs = [];

  for (let i = 0; i < relevantPrimaries.length; i++) {
    const primary = relevantPrimaries[i];
    const itemNum = i + 1;

    try {
      // 1. Query all articles in this cluster
      const clusterArticles = await Article.find({ clusterId: primary.clusterId }).lean();

      // 2. Select best article in cluster
      const { selectedArticle, isDifferentFromPrimary } = selectBestArticleForSummary(clusterArticles);
      const articleToSummarize = selectedArticle || primary;

      if (isDifferentFromPrimary) {
        selectionDifferences++;
        console.log(`[Cluster ${primary.clusterId.slice(0, 8)}] Heuristic selected DIFFERENT article than isPrimary:`);
        console.log(`  - Primary:  [${primary.source}] "${primary.title.slice(0, 60)}..."`);
        console.log(`  - Selected: [${articleToSummarize.source}] "${articleToSummarize.title.slice(0, 60)}..."\n`);
      }

      // Find top ArticleRelevance record across all users for this article
      const topRelevance = await ArticleRelevance.findOne({ articleId: primary._id, isRelevant: true })
        .sort({ rankingScore: -1 })
        .lean();

      const confidenceTier = topRelevance?.confidenceTier || getConfidenceTier(topRelevance?.rankingScore || primary.rankingScore || 0);
      const matchedTopic = topRelevance?.matchedTopic || primary.matchedTopic || null;
      const rankingScore = topRelevance?.rankingScore ?? primary.rankingScore ?? null;

      console.log(`[${itemNum}/${relevantPrimaries.length}] Summarizing (${confidenceTier.toUpperCase()}): "${articleToSummarize.title.slice(0, 70)}..."`);

      // 3. Call Groq API with calibrated confidence tier
      const result = await callGroqSummarize({
        title: articleToSummarize.title,
        snippet: articleToSummarize.snippet,
        source: articleToSummarize.source,
        matchedTopic,
        confidenceTier,
        rankingScore,
      });

      // 4. Save to DB (unless dryRun)
      if (!options.dryRun) {
        await Article.updateOne(
          { _id: primary._id },
          {
            $set: {
              summary: result.summary,
              whyReadThis: result.whyReadThis,
              summarizedAt: new Date(),
              selectedArticleId: articleToSummarize._id,
            },
          }
        );
      }

      successCount++;
      sampleOutputs.push({
        clusterId: primary.clusterId,
        title: articleToSummarize.title,
        source: articleToSummarize.source,
        matchedTopic: primary.matchedTopic,
        summary: result.summary,
        whyReadThis: result.whyReadThis,
        isDifferentFromPrimary,
      });

      // 5. Delay to respect Groq rate limits
      if (i < relevantPrimaries.length - 1) {
        await sleep(config.GROQ_RATE_LIMIT_DELAY_MS);
      }
    } catch (err) {
      failCount++;
      failures.push({
        title: primary.title,
        error: err.message,
      });
      console.error(`[${itemNum}/${relevantPrimaries.length}] ✗ Failed: ${err.message}`);
    }
  }

  const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n======================================================');
  console.log('SUMMARIZATION SUMMARY');
  console.log(`Total clusters:         ${relevantPrimaries.length}`);
  console.log(`Successfully summarized: ${successCount}`);
  console.log(`Failed:                 ${failCount}`);
  console.log(`Different article picked: ${selectionDifferences}`);
  console.log(`Elapsed time:           ${elapsedSec}s`);
  if (failures.length > 0) {
    console.log('\nFailures breakdown:');
    failures.forEach((f, idx) => console.log(`  ${idx + 1}. "${f.title}": ${f.error}`));
  }
  console.log('======================================================\n');

  return {
    total: relevantPrimaries.length,
    successCount,
    failCount,
    selectionDifferences,
    sampleOutputs,
    failures,
  };
}

module.exports = {
  callGroqSummarize,
  summarizeRelevantClusters,
  getConfidenceTier,
  parseJsonSafe,
};
