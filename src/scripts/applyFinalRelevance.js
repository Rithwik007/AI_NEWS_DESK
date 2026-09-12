const { connectDB, disconnectDB } = require('../db/connect');
const Article = require('../models/Article');
const InterestProfile = require('../models/InterestProfile');
const { scoreRelevance, checkSpamKeywords } = require('../services/relevance');
const config = require('../config');

async function applyFinalRelevance() {
  await connectDB();

  try {
    const profile = await InterestProfile.findOne({ userId: 'default-user' }).lean();
    if (!profile) {
      throw new Error('No interest profile found for default-user');
    }

    const primaryArticles = await Article.find({ isPrimary: true });
    console.log(`Processing ${primaryArticles.length} primary articles...`);

    let passCount = 0;
    let excludedSimilarity = 0;
    let excludedKeyword = 0;
    const spamCatches = [];

    const bulkOps = [];

    for (const article of primaryArticles) {
      const { bestRawSimilarity, rankingScore, matchedTopic } = scoreRelevance(article.embedding, profile.topics);
      const spamCheck = checkSpamKeywords(article.title);

      let isRelevant = false;
      let filteredReason = null;

      if (spamCheck.isSpam) {
        isRelevant = false;
        filteredReason = 'keyword_spam_filter';
        excludedKeyword++;
        spamCatches.push({
          title: article.title,
          source: article.source,
          bestRawSimilarity,
          pattern: spamCheck.matchedPattern,
        });
      } else if (bestRawSimilarity < config.RAW_SIMILARITY_THRESHOLD) {
        isRelevant = false;
        filteredReason = 'similarity_threshold';
        excludedSimilarity++;
      } else {
        isRelevant = true;
        filteredReason = null;
        passCount++;
      }

      bulkOps.push({
        updateOne: {
          filter: { _id: article._id },
          update: {
            $set: {
              bestRawSimilarity,
              rankingScore,
              relevanceScore: rankingScore,
              matchedTopic,
              isRelevant,
              filteredReason,
            },
          },
        },
      });
    }

    // Also update non-primary articles to mark filteredReason as duplicate_non_primary
    bulkOps.push({
      updateMany: {
        filter: { isPrimary: false },
        update: {
          $set: {
            isRelevant: false,
            filteredReason: 'duplicate_non_primary',
          },
        },
      },
    });

    if (bulkOps.length > 0) {
      await Article.bulkWrite(bulkOps);
      console.log('MongoDB successfully updated with final relevance and filteredReason fields.');
    }

    console.log('\n===============================================================');
    console.log('FINAL RELEVANCE FILTER REPORT (THRESHOLD = 0.45)');
    console.log('===============================================================');
    console.log(`Total primary articles evaluated: ${primaryArticles.length}`);
    console.log(`Final pass count (isRelevant = true):   ${passCount}`);
    console.log(`Excluded by similarity_threshold:       ${excludedSimilarity}`);
    console.log(`Excluded by keyword_spam_filter:        ${excludedKeyword}`);
    console.log('---------------------------------------------------------------');

    console.log('\n--- ALL ARTICLES EXCLUDED BY KEYWORD SPAM FILTER ---');
    spamCatches.sort((a, b) => b.bestRawSimilarity - a.bestRawSimilarity);
    let anyAbove55 = false;
    spamCatches.forEach((c, i) => {
      if (c.bestRawSimilarity >= 0.55) anyAbove55 = true;
      console.log(`${i + 1}. [Raw: ${c.bestRawSimilarity.toFixed(4)}] [${c.source}] "${c.title}"`);
      console.log(`   Pattern: ${c.pattern}`);
    });

    console.log('\n--- HIGH SIMILARITY SAFETY CHECK (>= 0.55) ---');
    if (anyAbove55) {
      console.error('WARNING: At least one spam catch had raw similarity >= 0.55!');
    } else {
      console.log('CONFIRMED: Zero articles caught by keyword filter scored >= 0.55 (highest was ' + (spamCatches[0]?.bestRawSimilarity.toFixed(4) || 'N/A') + ').');
    }

  } finally {
    await disconnectDB();
  }
}

applyFinalRelevance().catch(console.error);
