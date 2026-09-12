const { connectDB, disconnectDB } = require('../db/connect');
const Article = require('../models/Article');
const { cosineSimilarity } = require('../services/dedup');

async function check() {
  await connectDB();
  const articles = await Article.find({}).sort({ fetchedAt: -1 }).lean();
  const clusterMap = new Map();
  for (const a of articles) {
    if (!clusterMap.has(a.clusterId)) clusterMap.set(a.clusterId, []);
    clusterMap.get(a.clusterId).push(a);
  }

  console.log(`Total clusters: ${clusterMap.size}`);
  let crossFetchFound = 0;

  for (const [cid, arts] of clusterMap) {
    if (arts.length > 1) {
      const times = arts.map(a => a.fetchedAt.getTime());
      const minTime = Math.min(...times);
      const maxTime = Math.max(...times);
      const diffMinutes = (maxTime - minTime) / (1000 * 60);

      // Check if articles were fetched in different runs (> 2 minutes apart)
      if (diffMinutes > 2) {
        crossFetchFound++;
        console.log(`\n======================================================`);
        console.log(`CROSS-RUN CLUSTER: ${cid}`);
        console.log(`Time span between fetches: ${diffMinutes.toFixed(1)} minutes`);
        console.log(`Articles (${arts.length}):`);
        for (const a of arts) {
          console.log(`- [${a.source}] (fetched: ${a.fetchedAt.toISOString()})`);
          console.log(`  Title: ${a.title}`);
          console.log(`  URL: ${a.url}`);
          console.log(`  isPrimary: ${a.isPrimary}`);
        }
        for (let i = 0; i < arts.length; i++) {
          for (let j = i + 1; j < arts.length; j++) {
            if (arts[i].embedding && arts[j].embedding) {
              const sim = cosineSimilarity(arts[i].embedding, arts[j].embedding);
              console.log(`  -> Pair similarity: ${sim.toFixed(4)}`);
            }
          }
        }
      }
    }
  }

  console.log(`\nTotal cross-fetch clusters found: ${crossFetchFound}`);
  await disconnectDB();
}

check().catch(console.error);
