const { connectDB, disconnectDB } = require('../db/connect');
const Article = require('../models/Article');
const { buildTierMessages, formatArticleEntry } = require('../services/telegram');

async function testFormatting() {
  await connectDB();
  try {
    const articles = await Article.find({ isRelevant: true, summary: { $ne: null } })
      .populate('selectedArticleId')
      .sort({ rankingScore: -1 })
      .lean();

    console.log(`Testing formatting on ${articles.length} summarized articles...\n`);

    const high = articles.filter(a => a.confidenceTier === 'high');
    const moderate = articles.filter(a => a.confidenceTier === 'moderate');
    const low = articles.filter(a => a.confidenceTier === 'low');

    console.log(`Counts: High=${high.length}, Moderate=${moderate.length}, Low=${low.length}`);

    // Build messages for each tier
    const highMsgs = buildTierMessages('high', high);
    const modMsgs = buildTierMessages('moderate', moderate);
    const lowMsgs = buildTierMessages('low', low);

    console.log(`High tier messages count: ${highMsgs.length}`);
    highMsgs.forEach((m, idx) => console.log(`  - Part ${idx + 1} char length: ${m.length}`));

    console.log(`Moderate tier messages count: ${modMsgs.length}`);
    modMsgs.forEach((m, idx) => console.log(`  - Part ${idx + 1} char length: ${m.length}`));

    console.log(`Low tier messages count: ${lowMsgs.length}`);
    lowMsgs.forEach((m, idx) => console.log(`  - Part ${idx + 1} char length: ${m.length}`));

    // Print preview of first 300 chars of each message
    console.log('\n--- PREVIEW: High Tier Message (First Part) ---');
    console.log(highMsgs[0].slice(0, 500) + '...\n');

    console.log('--- PREVIEW: Low Tier Message ---');
    console.log(lowMsgs[0].slice(0, 500) + '...\n');

  } finally {
    await disconnectDB();
  }
}

testFormatting().catch(console.error);
