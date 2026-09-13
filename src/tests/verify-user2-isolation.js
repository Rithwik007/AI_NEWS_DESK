const { connectDB, disconnectDB } = require('../db/connect');
const InterestProfile = require('../models/InterestProfile');
const ArticleRelevance = require('../models/ArticleRelevance');
const Article = require('../models/Article');
const { getEligibleTop5Articles } = require('../services/telegram');

const USER_2_ID = 'user_3JEiVTkaMiLMxjxLMFeqJkv3FO8';

async function verifyUser2() {
  console.log('=== VERIFYING USER 2 PROFILE & DATA ISOLATION ===\n');
  await connectDB();

  try {
    // 1. Inspect User 2 InterestProfile
    const profile = await InterestProfile.findOne({ userId: USER_2_ID }).lean();
    if (!profile) {
      console.error(`User 2 profile (${USER_2_ID}) NOT FOUND!`);
      return;
    }

    console.log('--- 1. USER 2 INTEREST PROFILE DOCUMENT ---');
    console.log(`User ID:      ${profile.userId}`);
    console.log(`Updated At:   ${profile.updatedAt ? new Date(profile.updatedAt).toISOString() : 'null'}`);
    console.log(`Topic Count:  ${profile.topics.length}`);
    profile.topics.forEach((t, i) => {
      console.log(`  Topic [${i + 1}]: "${t.topic}"`);
      console.log(`  Weight:    ${t.weight}`);
      console.log(`  Embedding: length = ${t.embedding?.length}, sample = [${t.embedding?.slice(0, 3).map(n => n.toFixed(4)).join(', ')}...]`);
    });

    // 2. Inspect User 2 ArticleRelevance Records
    console.log('\n--- 2. USER 2 ARTICLERELEVANCE RECORDS ---');
    const rels = await ArticleRelevance.find({ userId: USER_2_ID }).lean();
    console.log(`Total ArticleRelevance records for User 2: ${rels.length}`);

    // Check all unique matchedTopic values in User 2 records
    const distinctTopics = [...new Set(rels.map((r) => r.matchedTopic))];
    console.log(`Distinct matchedTopic values in User 2 records:`);
    distinctTopics.forEach((dt) => console.log(`  - "${dt}"`));

    // Confirm NONE of User 1's 9 topics appear in User 2's records
    const user1Profile = await InterestProfile.findOne({ userId: 'user_3JEbz6SSqzGyAWyPDFRx7wvePp1' }).lean();
    const user1TopicStrings = new Set(user1Profile.topics.map(t => t.topic));
    const contaminated = distinctTopics.filter(dt => user1TopicStrings.has(dt));
    console.log(`Cross-contamination check (any User 1 topics in User 2 matchedTopic?): ${contaminated.length === 0 ? 'NONE (CLEAN)' : contaminated}`);

    // Spot-check top passing records
    const passing = rels.filter((r) => r.isRelevant);
    console.log(`\nPassing records (isRelevant=true): ${passing.length}`);
    passing.sort((a, b) => b.rankingScore - a.rankingScore);

    console.log('\nSpot-check top passing articles for User 2:');
    for (let i = 0; i < Math.min(5, passing.length); i++) {
      const r = passing[i];
      const art = await Article.findById(r.articleId, { title: 1, source: 1 }).lean();
      console.log(`  #${i + 1} [Rank: ${r.rankingScore?.toFixed(4)} | Raw: ${r.bestRawSimilarity?.toFixed(4)} | Tier: ${r.confidenceTier}]`);
      console.log(`     Title:  "${art?.title}"`);
      console.log(`     Source: [${art?.source}]`);
      console.log(`     Topic:  "${r.matchedTopic}"`);
    }

    // 3. User 2 Top 5 Delivery Selection
    console.log('\n--- 3. USER 2 TOP-5 DELIVERY SIMULATION ---');
    // Query eligible articles for User 2
    const eligible = await ArticleRelevance.find({
      userId: USER_2_ID,
      isRelevant: true,
      confidenceTier: { $in: ['high', 'moderate'] },
      deliveryStatus: { $ne: 'delivered' }
    })
      .sort({ rankingScore: -1 })
      .limit(5)
      .lean();

    console.log(`Eligible top-5 candidates for User 2 (high/moderate tier, undelivered): ${eligible.length}`);
    for (let i = 0; i < eligible.length; i++) {
      const e = eligible[i];
      const art = await Article.findById(e.articleId, { title: 1, source: 1 }).lean();
      console.log(`  ${i + 1}. [Score: ${e.rankingScore?.toFixed(4)} | Raw: ${e.bestRawSimilarity?.toFixed(4)}] "${art?.title}"`);
      console.log(`     Topic: "${e.matchedTopic}"`);
    }

  } finally {
    await disconnectDB();
  }
}

verifyUser2().catch(console.error);
