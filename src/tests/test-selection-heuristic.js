const { connectDB, disconnectDB } = require('../db/connect');
const Article = require('../models/Article');
const { selectBestArticleForSummary } = require('../services/articleSelection');

async function testSelection() {
  await connectDB();

  try {
    const relevantPrimaries = await Article.find({ isPrimary: true, isRelevant: true }).lean();
    console.log(`Total relevant clusters to evaluate: ${relevantPrimaries.length}\n`);

    let differentCount = 0;

    for (const primary of relevantPrimaries) {
      const clusterArticles = await Article.find({ clusterId: primary.clusterId }).lean();
      const result = selectBestArticleForSummary(clusterArticles);

      if (result.isDifferentFromPrimary) {
        differentCount++;
        console.log('========================================================================');
        console.log(`CLUSTER DIFFERENCE DETECTED: [Cluster ${primary.clusterId}]`);
        console.log('------------------------------------------------------------------------');
        console.log(`DEFAULT PRIMARY ARTICLE:`);
        console.log(`  Source:  [${primary.source}]`);
        console.log(`  Title:   "${primary.title}"`);
        console.log(`  Snippet: "${primary.snippet}"`);
        console.log(`SELECTED BEST ARTICLE:`);
        console.log(`  Source:  [${result.selectedArticle.source}]`);
        console.log(`  Title:   "${result.selectedArticle.title}"`);
        console.log(`  Snippet: "${result.selectedArticle.snippet}"`);
        console.log(`Candidate Breakdown:`);
        result.candidateScores.forEach((c) => {
          console.log(`  - [Score: ${c.score.toFixed(1)}] ${c.isPrimary ? '(PRIMARY)' : '(OTHER)  '} [${c.source}] ${c.title.slice(0, 60)}...`);
          console.log(`    (len: ${c.breakdown.lengthScore.toFixed(1)}, source: ${c.breakdown.sourceScore}, clean: ${c.breakdown.cleanlinessScore}, pen: ${c.breakdown.penalty})`);
        });
        console.log('========================================================================\n');
      }
    }

    console.log(`Summary: ${differentCount} out of ${relevantPrimaries.length} relevant clusters had a different best article selected than isPrimary.`);
  } finally {
    await disconnectDB();
  }
}

testSelection().catch(console.error);
