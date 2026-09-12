const { connectDB, disconnectDB } = require('../db/connect');
const Article = require('../models/Article');
const InterestProfile = require('../models/InterestProfile');
const { scoreRelevance } = require('../services/relevance');
const config = require('../config');

async function rescoreAll() {
  await connectDB();

  try {
    const profile = await InterestProfile.findOne({ userId: 'default-user' }).lean();
    if (!profile) {
      console.error('No interest profile found!');
      return;
    }

    const primaryArticles = await Article.find({ isPrimary: true }, {
      title: 1, source: 1, embedding: 1, clusterId: 1
    }).lean();

    console.log(`\n======================================================`);
    console.log(`RE-SCORING ALL ${primaryArticles.length} PRIMARY ARTICLES WITH REDESIGNED LOGIC`);
    console.log(`Pass/Fail Gate: bestRawSimilarity >= ${config.RAW_SIMILARITY_THRESHOLD}`);
    console.log(`======================================================\n`);

    const scored = [];
    for (const a of primaryArticles) {
      if (!a.embedding || a.embedding.length === 0) continue;
      const res = scoreRelevance(a.embedding, profile.topics);
      scored.push({
        title: a.title,
        source: a.source,
        rawSim: res.bestRawSimilarity,
        rankingScore: res.rankingScore,
        matchedTopic: res.matchedTopic,
        isRelevant: res.bestRawSimilarity >= config.RAW_SIMILARITY_THRESHOLD,
      });
    }

    // Sort by bestRawSimilarity descending
    scored.sort((a, b) => b.rawSim - a.rawSim);

    // Distribution buckets for raw similarity
    const rawBuckets = {
      '>= 0.55': 0,
      '0.50 - 0.55': 0,
      '0.45 - 0.50 (Pass Zone)': 0,
      '0.40 - 0.45 (Near Miss)': 0,
      '0.35 - 0.40': 0,
      '< 0.35': 0,
    };

    for (const s of scored) {
      if (s.rawSim >= 0.55) rawBuckets['>= 0.55']++;
      else if (s.rawSim >= 0.50) rawBuckets['0.50 - 0.55']++;
      else if (s.rawSim >= 0.45) rawBuckets['0.45 - 0.50 (Pass Zone)']++;
      else if (s.rawSim >= 0.40) rawBuckets['0.40 - 0.45 (Near Miss)']++;
      else if (s.rawSim >= 0.35) rawBuckets['0.35 - 0.40']++;
      else rawBuckets['< 0.35']++;
    }

    console.log('--- RAW SIMILARITY DISTRIBUTION ---');
    for (const [range, count] of Object.entries(rawBuckets)) {
      const pct = ((count / scored.length) * 100).toFixed(1);
      const bar = '#'.repeat(Math.round(count / 2));
      console.log(`  ${range.padEnd(25)}: ${String(count).padStart(3)} (${pct.padStart(5)}%) ${bar}`);
    }

    const passed = scored.filter(s => s.isRelevant);
    console.log(`\nTotal Passing Gate (rawSim >= ${config.RAW_SIMILARITY_THRESHOLD}): ${passed.length} (${((passed.length / scored.length) * 100).toFixed(1)}%)`);
    console.log(`Total Failing Gate (rawSim < ${config.RAW_SIMILARITY_THRESHOLD}):  ${scored.length - passed.length} (${(((scored.length - passed.length) / scored.length) * 100).toFixed(1)}%)\n`);

    // Topic diversity among passers
    console.log('--- TOPIC DIVERSITY AMONG PASSERS (Raw Gate >= 0.45) ---');
    const topicCounts = {};
    profile.topics.forEach(t => topicCounts[t.topic] = 0);
    for (const s of passed) {
      topicCounts[s.matchedTopic] = (topicCounts[s.matchedTopic] || 0) + 1;
    }

    for (const [topic, count] of Object.entries(topicCounts).sort((a, b) => b[1] - a[1])) {
      const pct = passed.length > 0 ? ((count / passed.length) * 100).toFixed(1) : '0.0';
      console.log(`  [${String(count).padStart(2)} | ${pct.padStart(5)}%] "${topic}"`);
    }

    // Spot-check borderline pass articles (0.45 - 0.48)
    console.log('\n--- BORDERLINE PASS SPOT-CHECK (0.450 - 0.480) ---');
    const borderPass = passed.filter(s => s.rawSim >= 0.45 && s.rawSim <= 0.48);
    console.log(`Count in border pass zone: ${borderPass.length}`);
    borderPass.slice(0, 10).forEach((s, i) => {
      console.log(`${i + 1}. [Raw: ${s.rawSim.toFixed(4)} | Rank: ${s.rankingScore.toFixed(4)}]`);
      console.log(`   Source: [${s.source}]`);
      console.log(`   Title:  ${s.title}`);
      console.log(`   Topic:  "${s.matchedTopic}"\n`);
    });

    // Spot-check borderline fail articles (0.420 - 0.449)
    console.log('--- BORDERLINE FAIL SPOT-CHECK (0.420 - 0.449) ---');
    const borderFail = scored.filter(s => s.rawSim >= 0.42 && s.rawSim < 0.45);
    console.log(`Count in border fail zone: ${borderFail.length}`);
    borderFail.slice(0, 10).forEach((s, i) => {
      console.log(`${i + 1}. [Raw: ${s.rawSim.toFixed(4)} | Rank: ${s.rankingScore.toFixed(4)}]`);
      console.log(`   Source: [${s.source}]`);
      console.log(`   Title:  ${s.title}`);
      console.log(`   Topic:  "${s.matchedTopic}"\n`);
    });

  } finally {
    await disconnectDB();
  }
}

rescoreAll().catch(console.error);
