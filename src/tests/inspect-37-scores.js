const { connectDB, disconnectDB } = require('../db/connect');
const Article = require('../models/Article');

async function inspectScores() {
  await connectDB();
  try {
    const articles = await Article.find({ isRelevant: true }, {
      title: 1, source: 1, bestRawSimilarity: 1, rankingScore: 1, matchedTopic: 1
    }).lean();

    articles.sort((a, b) => b.rankingScore - a.rankingScore);

    console.log(`Total relevant articles: ${articles.length}`);
    console.log('--- ALL 37 ARTICLES SORTED BY RANKINGSCORE ---');
    articles.forEach((a, i) => {
      console.log(
        `${(i + 1).toString().padStart(2)}. Rank: ${a.rankingScore.toFixed(4)} | Raw: ${a.bestRawSimilarity.toFixed(4)} | [${a.source.slice(0, 15)}] | "${a.title.slice(0, 60)}..."`
      );
    });

    const downloadArt = articles.find((a) => a.title.includes('The Download'));
    console.log('\n--- SAMPLE 3 (The Download) SPECIFIC ---');
    console.log(downloadArt);
  } finally {
    await disconnectDB();
  }
}

inspectScores().catch(console.error);
