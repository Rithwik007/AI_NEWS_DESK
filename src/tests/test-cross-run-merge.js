/**
 * Cross-run merge verification test — artificial-but-real-data.
 *
 * Goal: prove that a "new" article with real content from a known cluster
 * gets merged into the EXISTING clusterId, not a new one.
 *
 * Method:
 * 1. Query DB for articles in a known multi-article cluster (Jalapeño chip)
 * 2. Take one article's real title/snippet/content
 * 3. Give it a fake URL (to bypass URL dedup) and fresh fetchedAt
 * 4. Run it through generateEmbeddings + clusterArticles (the real pipeline logic)
 * 5. Verify: clusterId matches original, isPrimary = false
 * 6. Report similarity score + clusterId match
 *
 * Does NOT insert the test article into the DB — read-only verification.
 */
const { connectDB, disconnectDB } = require('../db/connect');
const { generateEmbeddings } = require('../services/embeddings');
const { clusterArticles, cosineSimilarity } = require('../services/dedup');
const Article = require('../models/Article');
const config = require('../config');

async function testCrossRunMerge() {
  await connectDB();

  try {
    // 1. Find a multi-article cluster to use as test target
    //    Look for clusters with 2+ articles (e.g., Jalapeño chip cluster)
    const allArticles = await Article.find({}, {
      title: 1, source: 1, clusterId: 1, isPrimary: 1,
      embedding: 1, publishedAt: 1, snippet: 1, url: 1, fetchedAt: 1
    }).lean();

    // Group by clusterId
    const clusterMap = new Map();
    for (const a of allArticles) {
      if (!clusterMap.has(a.clusterId)) clusterMap.set(a.clusterId, []);
      clusterMap.get(a.clusterId).push(a);
    }

    // Find multi-article clusters, prefer ones with different sources
    const multiClusters = [...clusterMap.entries()]
      .filter(([, arts]) => arts.length > 1)
      .sort((a, b) => b[1].length - a[1].length); // largest first

    if (multiClusters.length === 0) {
      console.error('No multi-article clusters found in DB. Cannot run test.');
      process.exit(1);
    }

    // Pick first multi-article cluster
    const [targetClusterId, clusterArticlesArr] = multiClusters[0];
    console.log(`\n=== CROSS-RUN MERGE TEST ===\n`);
    console.log(`Target cluster: ${targetClusterId}`);
    console.log(`Cluster has ${clusterArticlesArr.length} articles:`);
    for (const a of clusterArticlesArr) {
      console.log(`  [${a.source}] ${a.title}`);
    }

    // 2. Pick one article from this cluster to re-process
    const donor = clusterArticlesArr[0];
    console.log(`\nDonor article: "${donor.title}"`);
    console.log(`Donor source: ${donor.source}`);
    console.log(`Donor original URL: ${donor.url.substring(0, 80)}...`);

    // 3. Create "new" article — same real content, different URL
    const testArticle = {
      source: donor.source,
      title: donor.title,
      url: `https://test-cross-run-verification/${Date.now()}`, // fake URL bypasses URL dedup
      publishedAt: donor.publishedAt,
      snippet: donor.snippet,
      // NO embedding — will be generated fresh by the pipeline
    };

    console.log(`\nTest article URL: ${testArticle.url}`);
    console.log(`Test article has NO pre-existing embedding — will be generated fresh.\n`);

    // 4. Generate embedding through real pipeline
    console.log('--- Step 1: Generating fresh embedding ---');
    await generateEmbeddings([testArticle]);

    // Compare fresh embedding to donor's stored embedding
    const freshVsStored = cosineSimilarity(testArticle.embedding, donor.embedding);
    console.log(`Fresh embedding vs stored embedding similarity: ${freshVsStored.toFixed(6)}`);
    console.log(`(Should be ~1.0 since same text; confirms deterministic embeddings)\n`);

    // 5. Load existing articles (simulating what the pipeline does)
    //    Use a very wide window to include all articles in DB
    console.log('--- Step 2: Loading existing articles for cross-run dedup ---');
    const existingArticles = await Article.find(
      {}, // No publishedAt filter — load ALL articles for this test
      { title: 1, url: 1, publishedAt: 1, snippet: 1, embedding: 1, clusterId: 1, isPrimary: 1 }
    ).lean();
    console.log(`Loaded ${existingArticles.length} existing articles\n`);

    // 6. Run clustering — this is the exact same function the pipeline uses
    console.log('--- Step 3: Running clusterArticles (the real dedup logic) ---');
    const clustered = clusterArticles([testArticle], existingArticles);

    // 7. Verify results
    const result = clustered[0];
    console.log(`\n=== RESULTS ===`);
    console.log(`Test article clusterId:     ${result.clusterId}`);
    console.log(`Original cluster clusterId: ${targetClusterId}`);
    console.log(`ClusterId MATCH:            ${result.clusterId === targetClusterId ? '✅ YES' : '❌ NO'}`);
    console.log(`isPrimary:                  ${result.isPrimary} (should be false)`);

    // Show similarity between test article and each cluster member
    console.log(`\nPairwise similarities with cluster members:`);
    for (const member of clusterArticlesArr) {
      const sim = cosineSimilarity(result.embedding, member.embedding);
      console.log(`  sim=${sim.toFixed(4)} vs [${member.source}] "${member.title.substring(0, 60)}"`);
    }

    // Final verdict
    console.log(`\n=== VERDICT ===`);
    if (result.clusterId === targetClusterId && result.isPrimary === false) {
      console.log('✅ PASS — Cross-run dedup VERIFIED on real data.');
      console.log('   Test article with real content merged into existing cluster.');
      console.log('   ClusterId matches, isPrimary=false (correct for merge-into-existing).');
    } else if (result.clusterId !== targetClusterId) {
      console.log('❌ FAIL — Test article got a DIFFERENT clusterId.');
      console.log('   Cross-run dedup did NOT merge the article into the expected cluster.');
    } else {
      console.log('⚠️ PARTIAL — ClusterId matched but isPrimary was unexpected.');
    }

  } finally {
    await disconnectDB();
  }
}

testCrossRunMerge().catch(e => { console.error(e); process.exit(1); });
