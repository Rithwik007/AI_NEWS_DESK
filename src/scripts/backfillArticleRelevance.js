const { connectDB, disconnectDB } = require('../db/connect');
const Article = require('../models/Article');
const ArticleRelevance = require('../models/ArticleRelevance');

const TARGET_CLERK_USER_ID = 'user_3J9Rl5FHP3tYTNadS74NSmjwUZi';

async function backfillAndVerify() {
  console.log('=== STEP C: BACKFILL ARTICLERELEVANCE & VERIFICATION ===\n');
  await connectDB();

  try {
    // 1. Ensure indexes are created on ArticleRelevance
    await ArticleRelevance.syncIndexes();

    // 2. Pre-backfill baseline count
    const baselineArticles = await Article.find({ rankingScore: { $ne: null } }).lean();
    const baselineCount = baselineArticles.length;
    console.log(`[Baseline] Articles with rankingScore populated: ${baselineCount}`);

    // Clean existing ArticleRelevance for target user if re-running
    await ArticleRelevance.deleteMany({ userId: TARGET_CLERK_USER_ID });

    // 3. Prepare backfill documents
    const backfillDocs = baselineArticles.map((a) => ({
      userId: TARGET_CLERK_USER_ID,
      articleId: a._id,
      bestRawSimilarity: a.bestRawSimilarity ?? null,
      rankingScore: a.rankingScore ?? null,
      matchedTopic: a.matchedTopic ?? null,
      isRelevant: !!a.isRelevant,
      filteredReason: a.filteredReason ?? null,
      confidenceTier: a.confidenceTier ?? null,
      deliveryStatus: a.deliveryStatus ?? null,
      deliveredAt: a.deliveredAt ?? null,
      createdAt: a.fetchedAt || new Date(),
    }));

    // 4. Batch insert
    const insertResult = await ArticleRelevance.insertMany(backfillDocs, { ordered: false });
    console.log(`[Backfill] Successfully inserted ${insertResult.length} ArticleRelevance records.\n`);

    // -------------------------------------------------------------
    // VERIFICATION 4a & 4b: Baseline vs Backfilled Count
    // -------------------------------------------------------------
    const createdCount = await ArticleRelevance.countDocuments({ userId: TARGET_CLERK_USER_ID });
    console.log('--- VERIFICATION 4a & 4b: Record Count Reconciliation ---');
    console.log(`Baseline Article count (rankingScore != null): ${baselineCount}`);
    console.log(`ArticleRelevance records created:             ${createdCount}`);
    console.log(`Exact match: ${baselineCount === createdCount ? 'YES ✓' : 'NO ✗'}\n`);

    if (baselineCount !== createdCount) {
      throw new Error(`Count mismatch: baseline=${baselineCount}, created=${createdCount}`);
    }

    // -------------------------------------------------------------
    // VERIFICATION 4c: Spot-check 3 Random Articles
    // -------------------------------------------------------------
    console.log('--- VERIFICATION 4c: Spot-Check 3 Random Articles ---');
    // Pick 3 random articles from baseline
    const shuffled = [...baselineArticles].sort(() => 0.5 - Math.random());
    const sampleArticles = shuffled.slice(0, 3);

    for (let i = 0; i < sampleArticles.length; i++) {
      const art = sampleArticles[i];
      const rel = await ArticleRelevance.findOne({ articleId: art._id, userId: TARGET_CLERK_USER_ID }).lean();

      console.log(`Sample ${i + 1} [ID: ${art._id}]: "${art.title.slice(0, 50)}..."`);
      console.log(`  Article:          rankingScore=${art.rankingScore}, isRelevant=${art.isRelevant}, tier=${art.confidenceTier}, topic="${art.matchedTopic}", deliveryStatus=${art.deliveryStatus}`);
      console.log(`  ArticleRelevance: rankingScore=${rel.rankingScore}, isRelevant=${rel.isRelevant}, tier=${rel.confidenceTier}, topic="${rel.matchedTopic}", deliveryStatus=${rel.deliveryStatus}`);

      const scoreMatch = art.rankingScore === rel.rankingScore;
      const relevantMatch = art.isRelevant === rel.isRelevant;
      const tierMatch = (art.confidenceTier || null) === (rel.confidenceTier || null);
      const topicMatch = (art.matchedTopic || null) === (rel.matchedTopic || null);
      const statusMatch = (art.deliveryStatus || null) === (rel.deliveryStatus || null);

      console.log(`  Match check: score=${scoreMatch}, relevant=${relevantMatch}, tier=${tierMatch}, topic=${topicMatch}, status=${statusMatch}`);

      if (!scoreMatch || !relevantMatch || !tierMatch || !topicMatch || !statusMatch) {
        throw new Error(`Spot check mismatch on article ${art._id}`);
      }
      console.log('  ✓ Verified exact field match.\n');
    }

    // -------------------------------------------------------------
    // VERIFICATION 4d: Unique Compound Index Duplicate Rejection Test
    // -------------------------------------------------------------
    console.log('--- VERIFICATION 4d: Unique Compound Index Test ---');
    const testArticleId = sampleArticles[0]._id;
    let duplicateRejected = false;

    try {
      await ArticleRelevance.create({
        userId: TARGET_CLERK_USER_ID,
        articleId: testArticleId,
        rankingScore: 0.999,
        isRelevant: true,
      });
    } catch (err) {
      if (err.code === 11000 || err.message.includes('duplicate key')) {
        duplicateRejected = true;
        console.log(`Expected E11000 duplicate key error caught: ${err.message}`);
      } else {
        throw err;
      }
    }

    console.log(`Duplicate insert rejected by MongoDB: ${duplicateRejected ? 'YES ✓' : 'NO ✗'}\n`);

    if (!duplicateRejected) {
      throw new Error('Verification 4d Failed: Compound unique index did not reject duplicate insert.');
    }

    console.log('====================================================');
    console.log('ALL STEP C VERIFICATIONS PASSED SUCCESSFULLY');
    console.log('====================================================\n');

    return {
      baselineCount,
      createdCount,
      sampleArticles,
      duplicateRejected,
    };
  } finally {
    await disconnectDB();
  }
}

if (require.main === module) {
  backfillAndVerify()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Backfill verification failed:', err);
      process.exit(1);
    });
}

module.exports = { backfillAndVerify };
