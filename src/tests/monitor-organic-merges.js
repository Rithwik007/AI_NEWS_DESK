/**
 * Cross-run organic merge monitor.
 * 
 * Runs the pipeline, then queries DB for genuine organic cross-run merges:
 * articles from DIFFERENT fetchedAt timestamps that share a clusterId,
 * with similarity < 1.0 (proving they're genuinely different articles,
 * not the same text re-embedded).
 *
 * Usage: ARTICLE_MAX_AGE_HOURS=72 node src/tests/monitor-organic-merges.js
 */
const { connectDB, disconnectDB } = require('../db/connect');
const { fetchAllFeeds } = require('../services/fetchRSS');
const { generateEmbeddings } = require('../services/embeddings');
const { clusterArticles, cosineSimilarity } = require('../services/dedup');
const Article = require('../models/Article');
const config = require('../config');

async function runAndMonitor() {
  const runStart = new Date();
  console.log(`\n${'='.repeat(60)}`);
  console.log(`ORGANIC CROSS-RUN MERGE MONITOR`);
  console.log(`Run time: ${runStart.toISOString()}`);
  console.log(`ARTICLE_MAX_AGE_HOURS: ${config.ARTICLE_MAX_AGE_HOURS}`);
  console.log(`${'='.repeat(60)}\n`);

  await connectDB();

  try {
    // --- Run the normal pipeline ---
    console.log('--- Phase 1: Running pipeline ---\n');

    const articles = await fetchAllFeeds();
    if (articles.length === 0) {
      console.log('No articles fetched. Exiting.');
      return;
    }

    const existingUrls = await Article.find(
      { url: { $in: articles.map(a => a.url) } },
      { url: 1 }
    ).lean();
    const existingUrlSet = new Set(existingUrls.map(a => a.url));
    const newArticles = articles.filter(a => !existingUrlSet.has(a.url));

    console.log(`Fetched: ${articles.length}, New: ${newArticles.length}, Already in DB: ${existingUrlSet.size}`);

    if (newArticles.length === 0) {
      console.log('All articles already stored. Skipping to analysis.\n');
    } else {
      await generateEmbeddings(newArticles);

      const cutoff = new Date(Date.now() - config.ARTICLE_MAX_AGE_HOURS * 60 * 60 * 1000);
      const existingArticles = await Article.find(
        { publishedAt: { $gte: cutoff } },
        { title: 1, url: 1, publishedAt: 1, snippet: 1, embedding: 1, clusterId: 1, isPrimary: 1 }
      ).lean();
      console.log(`Loaded ${existingArticles.length} existing articles (within ${config.ARTICLE_MAX_AGE_HOURS}h) for cross-run dedup`);

      const clustered = clusterArticles(newArticles, existingArticles);

      // Count merges
      const mergedCount = clustered.filter(a =>
        existingArticles.some(e => e.clusterId === a.clusterId)
      ).length;

      // Store
      try {
        const result = await Article.insertMany(
          clustered.map(a => ({
            source: a.source, title: a.title, url: a.url,
            publishedAt: a.publishedAt, snippet: a.snippet,
            embedding: a.embedding, clusterId: a.clusterId,
            isPrimary: a.isPrimary, fetchedAt: new Date(),
          })),
          { ordered: false }
        );
        console.log(`\nStored ${result.length} articles. Merged into existing: ${mergedCount}\n`);
      } catch (error) {
        if (error.code === 11000 || error.name === 'BulkWriteError') {
          console.warn('Some duplicate URLs skipped during insert');
        } else {
          throw error;
        }
      }
    }

    // --- Phase 2: Detect organic cross-run merges ---
    console.log('--- Phase 2: Scanning for organic cross-run merges ---\n');

    const allArticles = await Article.find({}, {
      title: 1, source: 1, clusterId: 1, isPrimary: 1,
      embedding: 1, url: 1, fetchedAt: 1
    }).lean();

    // Group by cluster
    const clusterMap = new Map();
    for (const a of allArticles) {
      if (!clusterMap.has(a.clusterId)) clusterMap.set(a.clusterId, []);
      clusterMap.get(a.clusterId).push(a);
    }

    // Find clusters with articles from DIFFERENT fetchedAt timestamps (>1h apart)
    let organicMergesFound = 0;

    for (const [cid, arts] of clusterMap) {
      if (arts.length < 2) continue;

      // Get distinct fetchedAt timestamps (group by hour)
      const fetchTimes = arts.map(a => a.fetchedAt.getTime());
      const minFetch = Math.min(...fetchTimes);
      const maxFetch = Math.max(...fetchTimes);
      const gapHours = (maxFetch - minFetch) / (1000 * 60 * 60);

      // Must be >1h gap to count as cross-run (not same batch)
      if (gapHours < 1) continue;

      // Must have different URLs (not test articles)
      const uniqueUrls = new Set(arts.map(a => a.url));
      if (uniqueUrls.size < 2) continue;

      // Skip test URLs
      if (arts.some(a => a.url.startsWith('https://test-cross-run'))) continue;

      // Check pairwise: find pairs from different runs with sim < 0.99
      for (let i = 0; i < arts.length; i++) {
        for (let j = i + 1; j < arts.length; j++) {
          const fetchGap = Math.abs(arts[i].fetchedAt.getTime() - arts[j].fetchedAt.getTime());
          const fetchGapHours = fetchGap / (1000 * 60 * 60);

          if (fetchGapHours < 1) continue; // Same batch
          if (!arts[i].embedding || !arts[j].embedding) continue;

          const sim = cosineSimilarity(arts[i].embedding, arts[j].embedding);

          // Organic = sim < 0.99 (different articles, not identical text)
          // and sim >= 0.72 (above threshold, hence merged)
          if (sim < 0.99 && sim >= 0.72) {
            organicMergesFound++;
            console.log(`🎯 ORGANIC CROSS-RUN MERGE FOUND!`);
            console.log(`   Cluster: ${cid}`);
            console.log(`   Similarity: ${sim.toFixed(4)}`);
            console.log(`   Fetch gap: ${fetchGapHours.toFixed(1)} hours`);
            console.log(`   Article A: [${arts[i].source}] ${arts[i].title}`);
            console.log(`     URL: ${arts[i].url.substring(0, 80)}`);
            console.log(`     Fetched: ${arts[i].fetchedAt.toISOString()}`);
            console.log(`   Article B: [${arts[j].source}] ${arts[j].title}`);
            console.log(`     URL: ${arts[j].url.substring(0, 80)}`);
            console.log(`     Fetched: ${arts[j].fetchedAt.toISOString()}`);
            console.log('');
          }
        }
      }
    }

    console.log(`${'='.repeat(60)}`);
    if (organicMergesFound > 0) {
      console.log(`✅ ${organicMergesFound} ORGANIC CROSS-RUN MERGE(S) DETECTED!`);
      console.log(`Cross-run dedup verified organically. You can revert ARTICLE_MAX_AGE_HOURS to 24.`);
    } else {
      console.log(`⏳ No organic cross-run merges yet. Run again in 3-4 hours.`);
      console.log(`Total articles in DB: ${allArticles.length}`);
      console.log(`Multi-article clusters: ${[...clusterMap.values()].filter(a => a.length > 1).length}`);
    }
    console.log(`${'='.repeat(60)}\n`);

  } finally {
    await disconnectDB();
  }
}

runAndMonitor().catch(e => { console.error(e); process.exit(1); });
