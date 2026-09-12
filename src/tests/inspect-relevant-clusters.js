const { connectDB, disconnectDB } = require('../db/connect');
const Article = require('../models/Article');

async function inspectClusters() {
  await connectDB();
  try {
    const relevantPrimaries = await Article.find({ isPrimary: true, isRelevant: true }).lean();
    console.log(`Relevant primary articles: ${relevantPrimaries.length}`);

    const clusterIds = relevantPrimaries.map(a => a.clusterId);
    const allInClusters = await Article.find({ clusterId: { $in: clusterIds } }).lean();
    console.log(`Total articles across these clusters: ${allInClusters.length}`);

    const clusters = {};
    for (const a of allInClusters) {
      if (!clusters[a.clusterId]) clusters[a.clusterId] = [];
      clusters[a.clusterId].push(a);
    }

    const multiClusters = Object.entries(clusters).filter(([cid, arts]) => arts.length > 1);
    console.log(`Clusters with > 1 article: ${multiClusters.length}`);

    for (const [cid, arts] of multiClusters) {
      console.log('\n=============================================');
      console.log(`Cluster: ${cid} | Article count: ${arts.length}`);
      arts.forEach(a => {
        console.log(`  - ${a.isPrimary ? '[PRIMARY]' : '[OTHER]  '} [${a.source}] SnippetLen: ${(a.snippet || '').length}`);
        console.log(`    Title:   ${a.title}`);
        console.log(`    Snippet: ${(a.snippet || '').slice(0, 120)}...`);
      });
    }
  } finally {
    await disconnectDB();
  }
}

inspectClusters().catch(console.error);
