/**
 * Cross-run dedup verification — uses synthetic embeddings.
 * No network access needed except MongoDB Atlas.
 *
 * Creates manually crafted vectors where:
 * - Same-story articles have cosine similarity > 0.75
 * - Different-story articles have cosine similarity < 0.5
 */
const { connectDB, disconnectDB } = require('../db/connect');
const { clusterArticles, cosineSimilarity } = require('../services/dedup');
const Article = require('../models/Article');
const config = require('../config');

// --- Synthetic embedding helpers ---
// Create 384-dim vectors with controlled similarity
function makeBaseVector(seed) {
  const vec = new Array(384).fill(0);
  // Each "story" gets a distinct cluster of non-zero dimensions
  for (let i = seed * 40; i < (seed + 1) * 40 && i < 384; i++) {
    vec[i] = 0.8 + Math.random() * 0.2; // strong signal in this region
  }
  // Add small noise everywhere for realism
  for (let i = 0; i < 384; i++) {
    vec[i] += (Math.random() - 0.5) * 0.05;
  }
  return normalize(vec);
}

function makeVariant(baseVec, noise = 0.15) {
  // Create a variant that's similar but not identical
  const vec = baseVec.map(v => v + (Math.random() - 0.5) * noise);
  return normalize(vec);
}

function normalize(vec) {
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  return vec.map(v => v / norm);
}

// Create 4 base story vectors
const storyVectors = [
  makeBaseVector(0), // GPT-5 story
  makeBaseVector(1), // Gemini story
  makeBaseVector(2), // EU regulation story
  makeBaseVector(5), // CRISPR story (far away)
];

// Verify vectors have expected similarities
console.log('--- Vector similarity sanity check ---');
console.log(`Story0 vs Story0 variant: ${cosineSimilarity(storyVectors[0], makeVariant(storyVectors[0])).toFixed(3)} (should be > 0.75)`);
console.log(`Story0 vs Story1: ${cosineSimilarity(storyVectors[0], storyVectors[1]).toFixed(3)} (should be < 0.5)`);
console.log(`Story0 vs Story3: ${cosineSimilarity(storyVectors[0], storyVectors[3]).toFixed(3)} (should be < 0.5)`);
console.log('');

// --- Test Data ---
const batch1 = [
  {
    source: 'TechCrunch AI',
    title: 'OpenAI releases GPT-5 with major reasoning improvements',
    url: 'https://techcrunch.com/openai-gpt5-release',
    publishedAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
    snippet: 'OpenAI has launched GPT-5 with advances in multi-step reasoning.',
    embedding: storyVectors[0],
  },
  {
    source: 'TechCrunch AI',
    title: 'Google DeepMind announces Gemini 3.0 multimodal AI system',
    url: 'https://techcrunch.com/deepmind-gemini-3',
    publishedAt: new Date(Date.now() - 10 * 60 * 60 * 1000),
    snippet: 'Google DeepMind has unveiled Gemini 3.0 multimodal AI.',
    embedding: storyVectors[1],
  },
  {
    source: 'MIT Technology Review',
    title: 'EU passes comprehensive AI regulation framework',
    url: 'https://techreview.com/eu-ai-regulation-2025',
    publishedAt: new Date(Date.now() - 8 * 60 * 60 * 1000),
    snippet: 'The EU has passed sweeping AI regulation.',
    embedding: storyVectors[2],
  },
];

const batch2 = [
  {
    source: 'VentureBeat AI',
    title: 'GPT-5 launched by OpenAI with enhanced reasoning and math skills',
    url: 'https://venturebeat.com/openai-gpt5-launch',
    publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    snippet: 'OpenAI released GPT-5 with improvements to reasoning.',
    embedding: makeVariant(storyVectors[0]),
  },
  {
    source: 'Google News AI',
    title: 'DeepMind reveals Gemini 3 with advanced multimodal capabilities',
    url: 'https://news.google.com/deepmind-gemini-3-reveal',
    publishedAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
    snippet: 'DeepMind announced Gemini 3 with multimodal capabilities.',
    embedding: makeVariant(storyVectors[1]),
  },
  {
    source: 'VentureBeat AI',
    title: 'European Union enacts strict new AI laws and regulations',
    url: 'https://venturebeat.com/eu-ai-laws-enacted',
    publishedAt: new Date(Date.now() - 30 * 60 * 1000),
    snippet: 'The EU enacted comprehensive AI regulatory framework.',
    embedding: makeVariant(storyVectors[2]),
  },
  {
    source: 'MIT Technology Review',
    title: 'CRISPR gene therapy successfully treats sickle cell disease',
    url: 'https://techreview.com/crispr-sickle-cell-trial',
    publishedAt: new Date(Date.now() - 15 * 60 * 1000),
    snippet: 'CRISPR-based gene therapy shows success treating sickle cell.',
    embedding: storyVectors[3],
  },
];

async function runTest() {
  console.log('======= CROSS-RUN DEDUP VERIFICATION TEST =======\n');

  await connectDB();

  try {
    // Clean slate
    await Article.deleteMany({});
    console.log('[Test] Cleared all articles from DB\n');

    // --- BATCH 1 ---
    console.log('=== BATCH 1 (first pipeline run) ===');
    const clustered1 = clusterArticles(batch1, []);

    const stored1 = await Article.insertMany(
      clustered1.map(a => ({
        source: a.source, title: a.title, url: a.url,
        publishedAt: a.publishedAt, snippet: a.snippet,
        embedding: a.embedding, clusterId: a.clusterId,
        isPrimary: a.isPrimary,
        fetchedAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
      }))
    );
    console.log(`[Test] Stored ${stored1.length} articles`);

    const batch1Clusters = [...new Set(clustered1.map(a => a.clusterId))];
    console.log(`[Test] Batch 1 clusters: ${batch1Clusters.length}`);
    for (const cid of batch1Clusters) {
      const arts = clustered1.filter(a => a.clusterId === cid);
      const primary = arts.find(a => a.isPrimary);
      console.log(`  ${cid.substring(0, 8)}: "${primary?.title.substring(0, 55)}"`);
    }

    // --- BATCH 2 ---
    console.log('\n=== BATCH 2 (second pipeline run) ===');

    const cutoff = new Date(Date.now() - config.ARTICLE_MAX_AGE_HOURS * 60 * 60 * 1000);
    const existingArticles = await Article.find(
      { publishedAt: { $gte: cutoff } },
      { title: 1, url: 1, publishedAt: 1, snippet: 1, embedding: 1, clusterId: 1, isPrimary: 1 }
    ).lean();
    console.log(`[Test] Loaded ${existingArticles.length} existing articles for cross-run dedup`);

    const clustered2 = clusterArticles(batch2, existingArticles);

    const stored2 = await Article.insertMany(
      clustered2.map(a => ({
        source: a.source, title: a.title, url: a.url,
        publishedAt: a.publishedAt, snippet: a.snippet,
        embedding: a.embedding, clusterId: a.clusterId,
        isPrimary: a.isPrimary,
        fetchedAt: new Date(),
      }))
    );
    console.log(`[Test] Stored ${stored2.length} articles`);

    // --- VERIFICATION ---
    console.log('\n======= VERIFICATION =======\n');

    // Check 1: Merged count
    const mergedCount = clustered2.filter(a =>
      existingArticles.some(e => e.clusterId === a.clusterId)
    ).length;
    const newClusterCount = [...new Set(clustered2.filter(a =>
      !existingArticles.some(e => e.clusterId === a.clusterId)
    ).map(a => a.clusterId))].length;
    console.log('CHECK 1: Cross-run merge count');
    console.log(`  Merged into existing clusters: ${mergedCount} (expected: 3)`);
    console.log(`  New clusters formed: ${newClusterCount} (expected: 1)`);
    console.log(`  ${mergedCount === 3 && newClusterCount === 1 ? 'PASS' : 'FAIL'}\n`);

    // Check 2: ClusterId reuse
    const batch2Clusters = [...new Set(clustered2.map(a => a.clusterId))];
    const reusedIds = batch2Clusters.filter(cid => batch1Clusters.includes(cid));
    console.log('CHECK 2: ClusterId reuse');
    console.log(`  Reused IDs: ${reusedIds.length} (expected: 3)`);
    console.log(`  ${reusedIds.length === 3 ? 'PASS' : 'FAIL'}\n`);

    // Check 3: isPrimary locked
    const mergedAsPrimary = clustered2.filter(a =>
      a.isPrimary && existingArticles.some(e => e.clusterId === a.clusterId)
    );
    console.log('CHECK 3: isPrimary locked (never dethrone)');
    console.log(`  Merged articles marked primary: ${mergedAsPrimary.length} (expected: 0)`);
    console.log(`  ${mergedAsPrimary.length === 0 ? 'PASS' : 'FAIL'}\n`);

    // Check 4: CRISPR = new cluster + primary
    const crisprArticle = clustered2.find(a => a.title.includes('CRISPR'));
    const crisprIsNew = !existingArticles.some(e => e.clusterId === crisprArticle?.clusterId);
    console.log('CHECK 4: New story gets own cluster');
    console.log(`  CRISPR is new cluster: ${crisprIsNew} (expected: true)`);
    console.log(`  CRISPR is primary: ${crisprArticle?.isPrimary} (expected: true)`);
    console.log(`  ${crisprIsNew && crisprArticle?.isPrimary ? 'PASS' : 'FAIL'}\n`);

    // Check 5: False positive spot-check
    console.log('CHECK 5: False positive spot-check');
    const allArticles = await Article.find({}, { title: 1, clusterId: 1, source: 1, isPrimary: 1 }).lean();
    const clusterMap = new Map();
    for (const a of allArticles) {
      if (!clusterMap.has(a.clusterId)) clusterMap.set(a.clusterId, []);
      clusterMap.get(a.clusterId).push(a);
    }
    for (const [cid, arts] of clusterMap) {
      console.log(`\n  Cluster ${cid.substring(0, 8)}... (${arts.length} articles):`);
      for (const a of arts) {
        console.log(`    ${a.isPrimary ? 'PRIMARY' : '      '} [${a.source}] ${a.title}`);
      }
    }

    // Check 6: Multi-fetchedAt aggregation
    console.log('\n\nCHECK 6: Clusters spanning multiple fetch runs');
    const multiRunClusters = await Article.aggregate([
      { $group: {
        _id: '$clusterId',
        sources: { $addToSet: '$source' },
        fetchCount: { $addToSet: '$fetchedAt' },
        count: { $sum: 1 },
      }},
      { $match: { count: { $gt: 1 } } },
      { $sort: { count: -1 } },
    ]);
    for (const c of multiRunClusters) {
      console.log(`  ${c._id.substring(0, 8)}: ${c.count} articles, ${c.fetchCount.length} fetch runs, sources: ${c.sources.join(', ')}`);
    }
    const crossRunClusters = multiRunClusters.filter(c => c.fetchCount.length > 1);
    console.log(`\n  Cross-run clusters: ${crossRunClusters.length} (expected: 3)`);
    console.log(`  ${crossRunClusters.length === 3 ? 'PASS' : 'FAIL'}`);

    // Final
    const allPass = mergedCount === 3 && reusedIds.length === 3 &&
      mergedAsPrimary.length === 0 && crisprIsNew && crisprArticle?.isPrimary &&
      crossRunClusters.length === 3 && newClusterCount === 1;
    console.log('\n======= FINAL VERDICT =======');
    console.log(allPass ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED');
    console.log('=============================\n');

    // Cleanup
    await Article.deleteMany({});
    console.log('[Test] Cleaned up test data');

  } finally {
    await disconnectDB();
  }
}

runTest().catch(e => { console.error(e); process.exit(1); });
