const { connectDB, disconnectDB } = require('../db/connect');
const Article = require('../models/Article');
const InterestProfile = require('../models/InterestProfile');
const { cosineSimilarity } = require('../services/dedup');
const { scoreRelevance } = require('../services/relevance');

async function evaluateRewrittenTopics() {
  await connectDB();

  try {
    const profile = await InterestProfile.findOne({ userId: 'default-user' }).lean();
    const primaryArticles = await Article.find({ isPrimary: true }, {
      title: 1, source: 1, snippet: 1, embedding: 1
    }).lean();

    console.log(`================================================================`);
    console.log(`EVALUATION OF REWRITTEN CONCRETE TOPICS (${primaryArticles.length} Primary Articles)`);
    console.log(`================================================================\n`);

    // 1. Check Ceiling Per Topic
    console.log('--- 1. NEW CEILINGS PER TOPIC ---');
    for (const t of profile.topics) {
      let maxSim = -Infinity;
      let bestArt = null;
      for (const a of primaryArticles) {
        if (!a.embedding?.length) continue;
        const s = cosineSimilarity(a.embedding, t.embedding);
        if (s > maxSim) {
          maxSim = s;
          bestArt = a;
        }
      }
      console.log(`[${maxSim.toFixed(4)}] ${t.topic.slice(0, 60)}...`);
      console.log(`         Best: [${bestArt?.source}] "${bestArt?.title.slice(0, 70)}"`);
    }

    // Score all articles
    const scored = [];
    for (const a of primaryArticles) {
      if (!a.embedding?.length) continue;
      const res = scoreRelevance(a.embedding, profile.topics);
      scored.push({
        title: a.title,
        source: a.source,
        rawSim: res.bestRawSimilarity,
        rankingScore: res.rankingScore,
        matchedTopic: res.matchedTopic,
      });
    }

    scored.sort((a, b) => b.rawSim - a.rawSim);

    // 2. New Raw Similarity Distribution
    console.log('\n--- 2. NEW RAW SIMILARITY DISTRIBUTION ---');
    const buckets = {
      '>= 0.55': 0,
      '0.50 - 0.55': 0,
      '0.45 - 0.50': 0,
      '0.40 - 0.45': 0,
      '0.35 - 0.40': 0,
      '< 0.35': 0,
    };

    for (const s of scored) {
      if (s.rawSim >= 0.55) buckets['>= 0.55']++;
      else if (s.rawSim >= 0.50) buckets['0.50 - 0.55']++;
      else if (s.rawSim >= 0.45) buckets['0.45 - 0.50']++;
      else if (s.rawSim >= 0.40) buckets['0.40 - 0.45']++;
      else if (s.rawSim >= 0.35) buckets['0.35 - 0.40']++;
      else buckets['< 0.35']++;
    }

    for (const [range, count] of Object.entries(buckets)) {
      const pct = ((count / scored.length) * 100).toFixed(1);
      const bar = '#'.repeat(Math.round(count / 2));
      console.log(`  ${range.padEnd(12)}: ${String(count).padStart(3)} (${pct.padStart(5)}%) ${bar}`);
    }

    // 3. Articles in 0.450 - 0.499 Band
    console.log('\n--- 3. FULL READ: 0.450 - 0.499 BAND AFTER REWRITING ---');
    const band45to50 = scored.filter(s => s.rawSim >= 0.45 && s.rawSim < 0.50);
    console.log(`Total articles in band: ${band45to50.length}\n`);

    band45to50.forEach((s, idx) => {
      console.log(`B_${idx + 1}|${s.rawSim.toFixed(4)}|[${s.source}]|${s.title}|TOPIC: ${s.matchedTopic.slice(0, 45)}...`);
    });

    // 4. Articles in >= 0.50 Band
    console.log('\n--- 4. ARTICLES SCORING >= 0.50 AFTER REWRITING ---');
    const band50plus = scored.filter(s => s.rawSim >= 0.50);
    console.log(`Total articles >= 0.50: ${band50plus.length}\n`);
    band50plus.forEach((s, idx) => {
      console.log(`T_${idx + 1}|${s.rawSim.toFixed(4)}|[${s.source}]|${s.title}|TOPIC: ${s.matchedTopic.slice(0, 45)}...`);
    });

  } finally {
    await disconnectDB();
  }
}

evaluateRewrittenTopics().catch(console.error);
