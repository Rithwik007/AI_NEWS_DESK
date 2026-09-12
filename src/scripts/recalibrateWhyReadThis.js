const { connectDB, disconnectDB } = require('../db/connect');
const Article = require('../models/Article');
const { callGroqSummarize, getConfidenceTier } = require('../services/summarize');
const { selectBestArticleForSummary } = require('../services/articleSelection');

async function recalibrate() {
  await connectDB();

  try {
    const relevantArticles = await Article.find({ isRelevant: true });
    console.log(`Processing ${relevantArticles.length} relevant articles...`);

    const borderlineArticles = [];

    for (const primary of relevantArticles) {
      const tier = getConfidenceTier(primary.rankingScore);

      // If low confidence (borderline), re-generate whyReadThis with calibrated honesty constraints
      if (tier === 'low') {
        borderlineArticles.push(primary);
      } else {
        // High/moderate: ensure confidenceTier is recorded in DB
        await Article.updateOne({ _id: primary._id }, { $set: { confidenceTier: tier } });
      }
    }

    console.log(`\nRe-generating whyReadThis for ${borderlineArticles.length} borderline articles (rankingScore < 0.25)...`);

    for (const primary of borderlineArticles) {
      const clusterArticles = await Article.find({ clusterId: primary.clusterId }).lean();
      const { selectedArticle } = selectBestArticleForSummary(clusterArticles);
      const articleToSummarize = selectedArticle || primary;

      console.log(`\n[Low-Confidence] Re-generating: "${articleToSummarize.title.slice(0, 60)}..."`);
      console.log(`  Scores: Raw=${primary.bestRawSimilarity.toFixed(4)} | Rank=${primary.rankingScore.toFixed(4)}`);

      const res = await callGroqSummarize({
        title: articleToSummarize.title,
        snippet: articleToSummarize.snippet,
        source: articleToSummarize.source,
        matchedTopic: primary.matchedTopic,
        confidenceTier: 'low',
        rankingScore: primary.rankingScore,
      });

      await Article.updateOne(
        { _id: primary._id },
        {
          $set: {
            summary: res.summary,
            whyReadThis: res.whyReadThis,
            confidenceTier: 'low',
            summarizedAt: new Date(),
          },
        }
      );

      console.log(`  Updated whyReadThis: "${res.whyReadThis}"`);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    console.log('\nAll articles successfully calibrated and tagged with confidenceTier!');
  } finally {
    await disconnectDB();
  }
}

recalibrate().catch(console.error);
