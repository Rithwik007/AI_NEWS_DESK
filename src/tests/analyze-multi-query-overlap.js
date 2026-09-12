const { connectDB, disconnectDB } = require('../db/connect');
const Article = require('../models/Article');
const { cosineSimilarity } = require('../services/dedup');

async function analyzeMultiQueryOverlap() {
  await connectDB();

  try {
    const articles = await Article.find({}, {
      title: 1, source: 1, clusterId: 1, isPrimary: 1,
      embedding: 1, url: 1, fetchedAt: 1
    }).lean();

    console.log(`\nTotal articles in database: ${articles.length}`);

    // Map by clusterId
    const clusterMap = new Map();
    for (const a of articles) {
      if (!clusterMap.has(a.clusterId)) clusterMap.set(a.clusterId, []);
      clusterMap.get(a.clusterId).push(a);
    }

    console.log(`Total clusters in database: ${clusterMap.size}`);

    // Find largest cluster
    let largestClusterId = null;
    let maxClusterSize = 0;
    for (const [cid, list] of clusterMap) {
      if (list.length > maxClusterSize) {
        maxClusterSize = list.length;
        largestClusterId = cid;
      }
    }
    console.log(`Largest cluster size: ${maxClusterSize} articles (Cluster: ${largestClusterId})\n`);

    // Check clusters spanning multiple distinct Google News queries
    const googleNewsPrefix = 'Google News:';
    let clustersWithMultiGoogleQueries = 0;

    console.log('=== CLUSTERS SPANNING 3+ GOOGLE NEWS QUERIES ===\n');

    for (const [cid, list] of clusterMap) {
      const googleSources = new Set(
        list
          .filter(a => a.source.startsWith(googleNewsPrefix))
          .map(a => a.source)
      );

      if (googleSources.size >= 3) {
        clustersWithMultiGoogleQueries++;
        console.log(`Cluster ${cid} (${list.length} articles, ${googleSources.size} Google News queries):`);
        console.log(`Sources present: ${[...googleSources].join(' | ')}`);
        for (const a of list) {
          console.log(`  - [${a.source}] (${a.isPrimary ? 'PRIMARY' : 'MERGED'}) ${a.title.slice(0, 80)}`);
        }
        // Pairwise similarities within cluster
        console.log('  Pairwise similarities:');
        for (let i = 0; i < list.length; i++) {
          for (let j = i + 1; j < list.length; j++) {
            if (list[i].embedding && list[j].embedding) {
              const sim = cosineSimilarity(list[i].embedding, list[j].embedding);
              console.log(`    sim=${sim.toFixed(4)}: "${list[i].title.slice(0, 35)}" <-> "${list[j].title.slice(0, 35)}"`);
            }
          }
        }
        console.log('');
      }
    }

    console.log(`Clusters spanning 3+ Google News queries: ${clustersWithMultiGoogleQueries}`);

    // Check potential SPLIT clusters: find pairs across DIFFERENT clusters with high similarity (0.65 - 0.75)
    console.log('\n=== CHECKING FOR SPLIT CLUSTERS (High similarity across different clusters) ===\n');
    let potentialSplits = 0;

    for (let i = 0; i < articles.length; i++) {
      for (let j = i + 1; j < articles.length; j++) {
        const a1 = articles[i];
        const a2 = articles[j];

        if (a1.clusterId !== a2.clusterId && a1.embedding && a2.embedding) {
          const sim = cosineSimilarity(a1.embedding, a2.embedding);
          if (sim >= 0.65) {
            potentialSplits++;
            console.log(`Potential Split (sim=${sim.toFixed(4)}):`);
            console.log(`  Cluster 1: ${a1.clusterId} | [${a1.source}] ${a1.title}`);
            console.log(`  Cluster 2: ${a2.clusterId} | [${a2.source}] ${a2.title}`);
            console.log('');
          }
        }
      }
    }

    if (potentialSplits === 0) {
      console.log('No split candidates with similarity >= 0.65 found! Threshold 0.72 clean.');
    } else {
      console.log(`Total potential split pairs (sim >= 0.65 across different clusters): ${potentialSplits}`);
    }

  } finally {
    await disconnectDB();
  }
}

analyzeMultiQueryOverlap().catch(console.error);
