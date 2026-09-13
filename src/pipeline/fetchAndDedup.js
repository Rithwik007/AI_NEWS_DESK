const { connectDB, disconnectDB } = require('../db/connect');
const { fetchAllFeeds } = require('../services/fetchRSS');
const { generateEmbeddings } = require('../services/embeddings');
const { clusterArticles } = require('../services/dedup');
const { summarizeRelevantClusters } = require('../services/summarize');
const { deliverToTelegram } = require('../services/telegram');
const Article = require('../models/Article');
const config = require('../config');

/**
 * Full AI News Pipeline: Fetch → Embed → Dedup → Relevance → Summarize → Deliver
 *
 * Orchestrates:
 * Step 1: RSS Fetch + Semantic Deduplication
 * Step 2: Relevance Filtering + Keyword Spam Filter
 * Step 3: Dynamic Article Selection + Groq LLM Summarization & Reasoning
 * Step 4: Telegram Digest Delivery grouped by Confidence Tier
 */
async function fetchAndDedup(options = {}) {
  const startTime = Date.now();
  const runType = options.runType || config.RUN_TYPE || 'morning';
  options.runType = runType;

  console.log(`[Pipeline] Starting run in ${runType.toUpperCase()} mode...`);

  // 1. Connect to DB
  await connectDB();

  try {
    // 2. Fetch from all RSS feeds
    const articles = await fetchAllFeeds();

    if (articles.length === 0) {
      console.log('[Pipeline] No articles fetched from feeds.');
    }

    // 3. Filter out articles already stored (by URL)
    const existingUrls = await Article.find(
      { url: { $in: articles.map((a) => a.url) } },
      { url: 1 }
    ).lean();
    const existingUrlSet = new Set(existingUrls.map((a) => a.url));

    const newArticles = articles.filter((a) => !existingUrlSet.has(a.url));
    console.log(`[Pipeline] ${newArticles.length} new articles (${existingUrlSet.size} already in DB)`);

    let primaryCount = 0;
    let dupeCount = 0;
    let newClusterCount = 0;
    let mergedCount = 0;
    let insertedCount = 0;
    let relevantCount = 0;
    let similarityExcludedCount = 0;
    let keywordExcludedCount = 0;
    const topicBreakdown = {};

    if (newArticles.length > 0) {
      // 4. Generate embeddings for new articles
      await generateEmbeddings(newArticles);

      // 5. Fetch existing articles within recency window for cross-run dedup
      const cutoff = new Date(Date.now() - config.ARTICLE_MAX_AGE_HOURS * 60 * 60 * 1000);
      const existingArticles = await Article.find(
        { publishedAt: { $gte: cutoff } },
        { title: 1, url: 1, publishedAt: 1, snippet: 1, embedding: 1, clusterId: 1, isPrimary: 1 }
      ).lean();
      console.log(`[Pipeline] Loaded ${existingArticles.length} existing articles (within ${config.ARTICLE_MAX_AGE_HOURS}h) for cross-run dedup`);

      // 6. Cluster by similarity (dedup) — cross-run + intra-batch
      const clusteredArticles = clusterArticles(newArticles, existingArticles);

      primaryCount = clusteredArticles.filter((a) => a.isPrimary).length;
      dupeCount = clusteredArticles.length - primaryCount;
      mergedCount = clusteredArticles.filter((a) => existingArticles.some((e) => e.clusterId === a.clusterId)).length;
      newClusterCount = primaryCount - clusteredArticles.filter((a) => a.isPrimary && existingArticles.some((e) => e.clusterId === a.clusterId)).length;

      // 7. Store new articles in MongoDB (Global Article Content)
      try {
        const result = await Article.insertMany(
          clusteredArticles.map((a) => ({
            source: a.source,
            title: a.title,
            url: a.url,
            publishedAt: a.publishedAt,
            snippet: a.snippet,
            embedding: a.embedding,
            clusterId: a.clusterId,
            isPrimary: a.isPrimary,
            fetchedAt: new Date(),
          })),
          { ordered: false }
        );
        insertedCount = result.length;
      } catch (error) {
        if (error.code === 11000 || error.name === 'BulkWriteError') {
          insertedCount = error.insertedDocs?.length || 0;
          console.warn(`[Pipeline] Some duplicate URLs skipped during insert`);
        } else {
          throw error;
        }
      }

      // 8. Step 2: Per-User Relevance Scoring in ArticleRelevance
      const InterestProfile = require('../models/InterestProfile');
      const ArticleRelevance = require('../models/ArticleRelevance');
      const { scoreRelevance, checkSpamKeywords } = require('../services/relevance');

      const profiles = await InterestProfile.find({ topics: { $exists: true, $not: { $size: 0 } } }).lean();
      console.log(`\n--- Step 2: Per-User Relevance Scoring (${profiles.length} user profile(s) found) ---`);

      // Retrieve inserted primary articles with their DB _ids and embeddings
      const currentPrimaryArticles = await Article.find(
        { url: { $in: clusteredArticles.filter((a) => a.isPrimary).map((a) => a.url) } },
        { _id: 1, title: 1, embedding: 1, clusterId: 1, isPrimary: 1 }
      ).lean();

      for (const profile of profiles) {
        // Prevent duplicate scoring: find articles already scored for this user
        const existingUserScores = await ArticleRelevance.find(
          {
            userId: profile.userId,
            articleId: { $in: currentPrimaryArticles.map((a) => a._id) },
          },
          { articleId: 1 }
        ).lean();
        const alreadyScoredSet = new Set(existingUserScores.map((r) => String(r.articleId)));

        const toScore = currentPrimaryArticles.filter((a) => !alreadyScoredSet.has(String(a._id)));
        console.log(`[Relevance] Scoring ${toScore.length} new primary articles for user "${profile.userId}" (${profile.topics.length} topics)...`);

        const userRelevanceDocs = [];
        let userRelevantCount = 0;
        let userSpamCount = 0;
        let userSimilarityExcludedCount = 0;

        for (const article of toScore) {
          const { bestRawSimilarity, rankingScore, matchedTopic } = scoreRelevance(article.embedding, profile.topics);
          const passesSimilarity = bestRawSimilarity >= config.RAW_SIMILARITY_THRESHOLD;
          const spamCheck = checkSpamKeywords(article.title);

          let isRelevant = false;
          let filteredReason = null;

          if (spamCheck.isSpam) {
            isRelevant = false;
            filteredReason = 'keyword_spam_filter';
            userSpamCount++;
          } else if (!passesSimilarity) {
            isRelevant = false;
            filteredReason = 'similarity_threshold';
            userSimilarityExcludedCount++;
          } else {
            isRelevant = true;
            filteredReason = null;
            userRelevantCount++;
          }

          const confidenceTier = rankingScore >= 0.35 ? 'high' : rankingScore >= 0.25 ? 'moderate' : 'low';

          userRelevanceDocs.push({
            userId: profile.userId,
            articleId: article._id,
            bestRawSimilarity,
            rankingScore,
            matchedTopic,
            isRelevant,
            filteredReason,
            confidenceTier,
            createdAt: new Date(),
          });
        }

        if (userRelevanceDocs.length > 0) {
          try {
            await ArticleRelevance.insertMany(userRelevanceDocs, { ordered: false });
          } catch (insertErr) {
            if (insertErr.code !== 11000 && insertErr.name !== 'BulkWriteError') {
              console.error(`[Relevance] Error saving relevance for user ${profile.userId}:`, insertErr.message);
            }
          }
        }

        relevantCount += userRelevantCount;
        similarityExcludedCount += userSimilarityExcludedCount;
        keywordExcludedCount += userSpamCount;

        console.log(`[Relevance] User "${profile.userId}" results: ${userRelevantCount} relevant, ${userSimilarityExcludedCount} below threshold, ${userSpamCount} spam`);
      }
    } else {
      console.log('[Pipeline] No new articles to embed/cluster.');
    }

    // Step 3: Summarization & Reasoning (Groq LLM)
    const summarizeStats = await summarizeRelevantClusters(options);

    // Step 4: Telegram Delivery
    const deliveryStats = await deliverToTelegram(options);

    // 9. Summary
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n========== PIPELINE RUN COMPLETE ==========');
    console.log(`Total articles fetched:         ${articles.length}`);
    console.log(`New articles (not in DB):        ${newArticles.length}`);
    console.log(`Articles stored:                 ${insertedCount}`);
    console.log(`New clusters formed:             ${newClusterCount}`);
    console.log(`Merged into existing clusters:   ${mergedCount}`);
    console.log(`Duplicates (non-primary):        ${dupeCount}`);
    console.log('--- Step 2: Relevance Filtering ---');
    console.log(`Primary articles scored:         ${primaryCount}`);
    console.log(`Passed (isRelevant = true):      ${relevantCount}`);
    console.log(`Excluded (similarity < ${config.RAW_SIMILARITY_THRESHOLD}):  ${similarityExcludedCount}`);
    console.log(`Excluded (keyword spam filter):  ${keywordExcludedCount}`);
    console.log('--- Step 3: Groq Summarization ---');
    console.log(`Summaries generated:             ${summarizeStats.successCount || 0} / ${summarizeStats.total || 0}`);
    console.log('--- Step 4: Telegram Delivery ---');
    console.log(`Run type:                        ${runType.toUpperCase()}`);
    console.log(`Delivery mode:                   ${config.DELIVERY_MODE}`);
    console.log(`Messages sent:                   ${deliveryStats.totalMessagesSent || 0}`);
    console.log(`Articles delivered:              ${deliveryStats.totalArticles || 0}`);
    console.log(`Time elapsed:                    ${elapsed}s`);
    console.log('===========================================\n');
    return {
      runType,
      articlesFetched: articles.length,
      newArticles: newArticles.length,
      summarizeStats,
      deliveryStats,
      elapsed,
    };
  } catch (pipelineErr) {
    console.error(`[Pipeline] Fatal pipeline error in ${runType} mode:`, pipelineErr.message);
    const { captureException } = require('../services/sentry');
    captureException(pipelineErr, {
      tags: {
        component: 'pipeline',
        runType,
      },
      extra: {
        options,
      },
    });
    throw pipelineErr;
  } finally {
    await disconnectDB();
  }
}

module.exports = { fetchAndDedup };

