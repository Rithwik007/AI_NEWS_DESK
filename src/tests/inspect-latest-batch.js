const { connectDB, disconnectDB } = require('../db/connect');
const Article = require('../models/Article');
const { cosineSimilarity } = require('../services/dedup');

async function inspectLatestBatch() {
  await connectDB();

  // Articles fetched within last 15 minutes
  const cutoff = new Date(Date.now() - 15 * 60 * 1000);
  const articles = await Article.find({ fetchedAt: { $gte: cutoff } }).lean();

  console.log(`Articles in latest batch: ${articles.length}`);

  const clusterMap = new Map();
  for (const a of articles) {
    if (!clusterMap.has(a.clusterId)) clusterMap.set(a.clusterId, []);
    clusterMap.get(a.clusterId).push(a);
  }

  console.log(`Clusters in latest batch: ${clusterMap.size}`);

  let multiGoogleQueryCount = 0;
  for (const [cid, arts] of clusterMap) {
    const googleSources = [...new Set(arts.filter(a => a.source.startsWith('Google News:')).map(a => a.source))];
    if (googleSources.length >= 2) {
      multiGoogleQueryCount++;
      console.log(`\nCluster ${cid} (${arts.length} articles across ${googleSources.length} queries):`);
      arts.forEach(a => console.log(`  - [${a.source}] ${a.title.slice(0, 80)}`));
      for (let i = 0; i < arts.length; i++) {
        for (let j = i + 1; j < arts.length; j++) {
          if (arts[i].embedding && arts[j].embedding) {
            const sim = cosineSimilarity(arts[i].embedding, arts[j].embedding);
            console.log(`    sim=${sim.toFixed(4)}`);
          }
        }
      }
    }
  }

  console.log(`\nTotal clusters with 2+ Google News queries: ${multiGoogleQueryCount}`);

  // Check if any pairs within this batch across different clusters have sim >= 0.70
  console.log('\n--- Checking intra-batch split candidates (sim >= 0.70 across clusters) ---');
  let intraSplits = 0;
  for (let i = 0; i < articles.length; i++) {
    for (let j = i + 1; j < articles.length; j++) {
      if (articles[i].clusterId !== articles[j].clusterId) {
        const sim = cosineSimilarity(articles[i].embedding, articles[j].embedding);
        if (sim >= 0.70) {
          intraSplits++;
          console.log(`Intra-batch split (sim=${sim.toFixed(4)}):`);
          console.log(`  A: [${articles[i].source}] ${articles[i].title}`);
          console.log(`  B: [${articles[j].source}] ${articles[j].title}`);
        }
      }
    }
  }

  if (intraSplits === 0) {
    console.log('Zero intra-batch split pairs >= 0.70! Intra-batch clustering merged all pairs >= 0.72 correctly.');
  }

  await disconnectDB();
}

inspectLatestBatch().catch(console.error);
