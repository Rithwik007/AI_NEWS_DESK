/**
 * Real-data analysis: examine actual stored articles, similarity scores,
 * cluster pairings, and threshold behavior.
 */
const { connectDB, disconnectDB } = require('../db/connect');
const { cosineSimilarity } = require('../services/dedup');
const Article = require('../models/Article');

async function analyze() {
  await connectDB();

  try {
    const articles = await Article.find({}, {
      title: 1, source: 1, clusterId: 1, isPrimary: 1,
      embedding: 1, publishedAt: 1, snippet: 1, url: 1
    }).lean();

    console.log(`Total articles in DB: ${articles.length}\n`);

    // --- 1. Show all multi-article clusters ---
    const clusterMap = new Map();
    for (const a of articles) {
      if (!clusterMap.has(a.clusterId)) clusterMap.set(a.clusterId, []);
      clusterMap.get(a.clusterId).push(a);
    }

    const multiClusters = [...clusterMap.entries()].filter(([, arts]) => arts.length > 1);
    console.log(`=== MULTI-ARTICLE CLUSTERS (${multiClusters.length} found) ===\n`);

    for (const [cid, arts] of multiClusters) {
      console.log(`Cluster ${cid.substring(0, 8)}... (${arts.length} articles):`);
      for (const a of arts) {
        console.log(`  ${a.isPrimary ? 'PRIMARY' : '      '} [${a.source}] ${a.title}`);
        console.log(`           URL: ${a.url.substring(0, 80)}`);
      }
      // Compute pairwise similarity within cluster
      for (let i = 0; i < arts.length; i++) {
        for (let j = i + 1; j < arts.length; j++) {
          const sim = cosineSimilarity(arts[i].embedding, arts[j].embedding);
          console.log(`  SIMILARITY: ${sim.toFixed(4)} between "${arts[i].title.substring(0, 40)}" <-> "${arts[j].title.substring(0, 40)}"`);
        }
      }
      console.log('');
    }

    // --- 2. Find top-10 highest similarity pairs across ALL articles ---
    console.log('=== TOP 10 HIGHEST SIMILARITY PAIRS (any articles) ===\n');
    const pairs = [];
    for (let i = 0; i < articles.length; i++) {
      for (let j = i + 1; j < articles.length; j++) {
        const sim = cosineSimilarity(articles[i].embedding, articles[j].embedding);
        pairs.push({ i, j, sim });
      }
    }
    pairs.sort((a, b) => b.sim - a.sim);

    for (let k = 0; k < Math.min(10, pairs.length); k++) {
      const p = pairs[k];
      const a1 = articles[p.i];
      const a2 = articles[p.j];
      const sameCluster = a1.clusterId === a2.clusterId;
      console.log(`${k + 1}. sim=${p.sim.toFixed(4)} ${sameCluster ? 'CLUSTERED' : 'NOT CLUSTERED'}`);
      console.log(`   A: [${a1.source}] ${a1.title.substring(0, 70)}`);
      console.log(`   B: [${a2.source}] ${a2.title.substring(0, 70)}`);
      console.log('');
    }

    // --- 3. Similarity distribution ---
    console.log('=== SIMILARITY DISTRIBUTION ===\n');
    const buckets = { '0.9+': 0, '0.8-0.9': 0, '0.75-0.8': 0, '0.7-0.75': 0, '0.6-0.7': 0, '0.5-0.6': 0, '<0.5': 0 };
    for (const p of pairs) {
      if (p.sim >= 0.9) buckets['0.9+']++;
      else if (p.sim >= 0.8) buckets['0.8-0.9']++;
      else if (p.sim >= 0.75) buckets['0.75-0.8']++;
      else if (p.sim >= 0.7) buckets['0.7-0.75']++;
      else if (p.sim >= 0.6) buckets['0.6-0.7']++;
      else if (p.sim >= 0.5) buckets['0.5-0.6']++;
      else buckets['<0.5']++;
    }
    console.log(`Total pairs: ${pairs.length}`);
    for (const [range, count] of Object.entries(buckets)) {
      const bar = '#'.repeat(Math.min(count, 50));
      console.log(`  ${range.padEnd(10)}: ${String(count).padStart(5)} ${bar}`);
    }

    // --- 4. Near-threshold pairs (0.65-0.75) — would these be false positives if threshold lowered? ---
    console.log('\n=== NEAR-THRESHOLD PAIRS (0.65-0.75) — potential false positives if threshold lowered ===\n');
    const nearThreshold = pairs.filter(p => p.sim >= 0.65 && p.sim < 0.75);
    for (const p of nearThreshold.slice(0, 5)) {
      const a1 = articles[p.i];
      const a2 = articles[p.j];
      console.log(`sim=${p.sim.toFixed(4)}:`);
      console.log(`  A: [${a1.source}] ${a1.title}`);
      console.log(`  B: [${a2.source}] ${a2.title}`);
      console.log('');
    }

    // --- 5. Show 3 clearly unrelated pairs for baseline ---
    console.log('=== 3 RANDOM LOW-SIMILARITY PAIRS (baseline) ===\n');
    const lowPairs = pairs.filter(p => p.sim < 0.3);
    for (let k = 0; k < 3 && k < lowPairs.length; k++) {
      const idx = Math.floor(Math.random() * lowPairs.length);
      const p = lowPairs[idx];
      const a1 = articles[p.i];
      const a2 = articles[p.j];
      console.log(`sim=${p.sim.toFixed(4)}: "${a1.title.substring(0, 50)}" <-> "${a2.title.substring(0, 50)}"`);
    }

    console.log('\n=== THRESHOLD VERDICT ===');
    const aboveThreshold = pairs.filter(p => p.sim >= 0.75).length;
    const inDangerZone = pairs.filter(p => p.sim >= 0.70 && p.sim < 0.75).length;
    console.log(`Pairs above 0.75 threshold: ${aboveThreshold}`);
    console.log(`Pairs in danger zone (0.70-0.75): ${inDangerZone}`);
    console.log(`Review the near-threshold pairs above to decide if 0.75 needs tuning.`);

  } finally {
    await disconnectDB();
  }
}

analyze().catch(e => { console.error(e); process.exit(1); });
