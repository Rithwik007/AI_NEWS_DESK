const { connectDB, disconnectDB } = require('../db/connect');
const Article = require('../models/Article');
const ArticleRelevance = require('../models/ArticleRelevance');
const InterestProfile = require('../models/InterestProfile');
const { scoreRelevance, checkSpamKeywords } = require('../services/relevance');
const { getConfidenceTier } = require('../services/summarize');
const config = require('../config');

const USER_1_ID = 'user_3J9Rl5FHP3tYTNadS74NSmjwUZi';

async function reapplyRelevanceAndSpam() {
  console.log('=== RETROACTIVE RESCORE & SPAM FILTER REAPPLICATION ===\n');
  await connectDB();

  try {
    const user1Profile = await InterestProfile.findOne({ userId: USER_1_ID }).lean();
    if (!user1Profile) throw new Error('User 1 profile not found');

    const primaryArticles = await Article.find({ isPrimary: true }).lean();
    console.log(`Scoring ${primaryArticles.length} primary articles against User 1 profile with full SPAM_PATTERNS suite...`);

    let spamCaught = 0;
    let relevantCount = 0;
    let similarityExcluded = 0;
    const spamCaughtList = [];

    for (const art of primaryArticles) {
      if (!art.embedding || art.embedding.length === 0) continue;

      const { bestRawSimilarity, rankingScore, matchedTopic } = scoreRelevance(art.embedding, user1Profile.topics);
      const passesSimilarity = bestRawSimilarity >= config.RAW_SIMILARITY_THRESHOLD;
      const spamCheck = checkSpamKeywords(art.title);

      let isRelevant = false;
      let filteredReason = null;

      if (spamCheck.isSpam) {
        isRelevant = false;
        filteredReason = 'keyword_spam_filter';
        spamCaught++;
        spamCaughtList.push({ id: art._id, title: art.title, pattern: spamCheck.matchedPattern });
      } else if (!passesSimilarity) {
        isRelevant = false;
        filteredReason = 'similarity_threshold';
        similarityExcluded++;
      } else {
        isRelevant = true;
        filteredReason = null;
        relevantCount++;
      }

      const confidenceTier = getConfidenceTier(rankingScore);

      // Update ArticleRelevance for User 1
      await ArticleRelevance.updateOne(
        { userId: USER_1_ID, articleId: art._id },
        {
          $set: {
            bestRawSimilarity,
            rankingScore,
            matchedTopic,
            isRelevant,
            filteredReason,
            confidenceTier,
          },
        },
        { upsert: true }
      );

      // Also update Article document safety-net fields
      await Article.updateOne(
        { _id: art._id },
        {
          $set: {
            bestRawSimilarity,
            rankingScore,
            matchedTopic,
            isRelevant,
            filteredReason,
            confidenceTier,
          },
        }
      );
    }

    console.log(`\n--- RESCORE SUMMARY ---`);
    console.log(`Primary articles evaluated: ${primaryArticles.length}`);
    console.log(`Passed (isRelevant = true):  ${relevantCount}`);
    console.log(`Excluded (similarity):       ${similarityExcluded}`);
    console.log(`Excluded (keyword spam):     ${spamCaught}`);

    console.log(`\n--- SPAM ARTICLES CAUGHT (${spamCaughtList.length}) ---`);
    spamCaughtList.forEach((s, idx) => {
      console.log(`${idx + 1}. [ID: ${s.id}] "${s.title.slice(0, 70)}..."`);
      console.log(`   Pattern: ${s.pattern}`);
    });

    // Specific verification of Adobe Illustrator article
    const adobeRel = await ArticleRelevance.findOne({
      userId: USER_1_ID,
      articleId: '6a9fe7fd54938057befde79f',
    }).lean();

    console.log('\n--- VERIFICATION OF TARGET ARTICLE (Adobe Illustrator) ---');
    console.log(`isRelevant:     ${adobeRel?.isRelevant} (expected: false)`);
    console.log(`filteredReason: ${adobeRel?.filteredReason} (expected: "keyword_spam_filter")`);

    if (adobeRel?.isRelevant !== false || adobeRel?.filteredReason !== 'keyword_spam_filter') {
      throw new Error('Target article was not correctly filtered!');
    }

    console.log('✓ Target article successfully marked isRelevant: false with filteredReason: "keyword_spam_filter".\n');
  } finally {
    await disconnectDB();
  }
}

if (require.main === module) {
  reapplyRelevanceAndSpam()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Failed:', err);
      process.exit(1);
    });
}
