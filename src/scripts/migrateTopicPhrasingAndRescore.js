/**
 * Migration Script: Topic Phrasing Refinement & ArticleRelevance Rescoring
 *
 * 1. Updates InterestProfile documents in MongoDB:
 *    - Topic 8: Replaces 'shipping with embedded on-device AI' with 'equipped with embedded on-device AI'
 *      (eliminates polysemic 'shipping' keyword attracting maritime freight articles).
 *    - Topic 7: Adds 'international AI governance and human rights policy'
 *      (ensures UN humanitarian/human rights AI stories match governance accurately).
 *    - Regenerates embeddings for the modified topics using all-MiniLM-L6-v2.
 *
 * 2. Rescores ArticleRelevance documents using improved scoreRelevance:
 *    - Applies candidate-weighted disambiguation among passing topics.
 *    - Updates bestRawSimilarity, rankingScore, matchedTopic, isRelevant, and confidenceTier.
 */
const { connectDB, disconnectDB } = require('../db/connect');
const InterestProfile = require('../models/InterestProfile');
const Article = require('../models/Article');
const ArticleRelevance = require('../models/ArticleRelevance');
const { generateEmbedding } = require('../services/embeddings');
const { scoreRelevance } = require('../services/relevance');
const config = require('../config');

async function migrateAndRescore() {
  console.log('=== STARTING TOPIC PHRASING MIGRATION & ARTICLE RESCORING ===\n');
  await connectDB();

  try {
    const profiles = await InterestProfile.find({});
    console.log(`Found ${profiles.length} InterestProfile(s) to inspect.\n`);

    for (const profile of profiles) {
      let modified = false;
      console.log(`Checking profile for user: ${profile.userId}`);

      for (let i = 0; i < profile.topics.length; i++) {
        const t = profile.topics[i];

        // 1. Check Topic 8 phrasing
        if (t.topic.includes('features shipping with embedded on-device AI')) {
          const newText = t.topic.replace(
            'features shipping with embedded on-device AI',
            'features equipped with embedded on-device AI'
          );
          console.log(`  [Topic ${i}] Updating Topic 8 phrasing (removing 'shipping with')...`);
          t.topic = newText;
          t.embedding = await generateEmbedding(newText);
          modified = true;
        }

        // 2. Check Topic 7 phrasing
        if (
          t.topic.includes('government legislation, copyright infringement lawsuits') &&
          !t.topic.includes('human rights')
        ) {
          const newText = t.topic.replace(
            'government legislation, copyright infringement lawsuits',
            'government legislation, international AI governance and human rights policy, copyright infringement lawsuits'
          );
          console.log(`  [Topic ${i}] Updating Topic 7 phrasing (adding international AI governance/human rights)...`);
          t.topic = newText;
          t.embedding = await generateEmbedding(newText);
          modified = true;
        }
      }

      if (modified) {
        profile.updatedAt = new Date();
        await profile.save();
        console.log(`✓ Saved updated InterestProfile for user: ${profile.userId}\n`);
      } else {
        console.log(`- Profile for user: ${profile.userId} already up to date.\n`);
      }
    }

    // Now rescore ArticleRelevance records for all users
    console.log('--- RESCORING ARTICLERELEVANCE RECORDS ---');
    const allProfiles = await InterestProfile.find({}).lean();
    const profileMap = new Map(allProfiles.map((p) => [p.userId, p.topics]));

    // Fetch all primary articles with embeddings
    const articles = await Article.find({ isPrimary: true }, {
      _id: 1, title: 1, embedding: 1
    }).lean();

    const articleMap = new Map(articles.map((a) => [a._id.toString(), a]));
    console.log(`Total primary articles available: ${articles.length}`);

    let totalUpdated = 0;
    let gateStatusChanged = 0;
    let topicChanged = 0;

    for (const [userId, topics] of profileMap.entries()) {
      const relevances = await ArticleRelevance.find({ userId });
      console.log(`Processing ${relevances.length} ArticleRelevance records for user ${userId}...`);

      for (const rel of relevances) {
        const article = articleMap.get(rel.articleId.toString());
        if (!article || !article.embedding || article.embedding.length === 0) continue;

        const scoreRes = scoreRelevance(article.embedding, topics);
        const passesSimilarity = scoreRes.bestRawSimilarity >= config.RAW_SIMILARITY_THRESHOLD;

        // Confidence tier
        let tier = 'low';
        if (scoreRes.rankingScore >= 0.35) {
          tier = 'high';
        } else if (scoreRes.rankingScore >= 0.25) {
          tier = 'moderate';
        }

        const prevRelevant = rel.isRelevant;
        const prevTopic = rel.matchedTopic;

        rel.bestRawSimilarity = scoreRes.bestRawSimilarity;
        rel.rankingScore = scoreRes.rankingScore;
        rel.relevanceScore = scoreRes.relevanceScore;
        rel.matchedTopic = scoreRes.matchedTopic;
        rel.isRelevant = passesSimilarity;
        rel.confidenceTier = tier;

        if (prevRelevant !== passesSimilarity) gateStatusChanged++;
        if (prevTopic !== scoreRes.matchedTopic) topicChanged++;

        await rel.save();
        totalUpdated++;
      }
    }

    console.log(`\n=== RESCORING COMPLETE ===`);
    console.log(`Total ArticleRelevance records updated: ${totalUpdated}`);
    console.log(`Admission gate status changed:           ${gateStatusChanged}`);
    console.log(`Topic assignment changed:                ${topicChanged}\n`);

  } finally {
    await disconnectDB();
  }
}

migrateAndRescore().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
