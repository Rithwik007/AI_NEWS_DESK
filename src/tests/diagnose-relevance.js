const { connectDB, disconnectDB } = require('../db/connect');
const Article = require('../models/Article');
const InterestProfile = require('../models/InterestProfile');
const { cosineSimilarity } = require('../services/dedup');
const { scoreRelevance } = require('../services/relevance');

async function runDiagnostics() {
  await connectDB();

  try {
    const profile = await InterestProfile.findOne({ userId: 'default-user' }).lean();
    if (!profile) {
      console.error('No interest profile found!');
      return;
    }

    const primaryArticles = await Article.find({ isPrimary: true }, {
      title: 1, source: 1, snippet: 1, embedding: 1, clusterId: 1
    }).lean();

    console.log(`Analyzing ${primaryArticles.length} primary articles...\n`);

    const scored = [];
    let maxRawSimOverall = -Infinity;
    let maxRawSimArticle = null;
    let maxRawSimTopic = null;

    for (const a of primaryArticles) {
      if (!a.embedding || a.embedding.length === 0) continue;

      const res = scoreRelevance(a.embedding, profile.topics);

      // Track all raw similarities to find overall ceiling
      for (const t of profile.topics) {
        const raw = cosineSimilarity(a.embedding, t.embedding);
        if (raw > maxRawSimOverall) {
          maxRawSimOverall = raw;
          maxRawSimArticle = a;
          maxRawSimTopic = t.topic;
        }
      }

      scored.push({
        title: a.title,
        source: a.source,
        score: res.relevanceScore,
        topic: res.matchedTopic,
        rawSim: res.rawSimilarity,
      });
    }

    scored.sort((a, b) => b.score - a.score);

    // --- 1. TOPIC DIVERSITY FOR ARTICLES >= 0.40 ---
    console.log('===============================================================');
    console.log('1. TOPIC DIVERSITY (Articles with Score >= 0.40)');
    console.log('===============================================================');
    const passing40 = scored.filter(s => s.score >= 0.40);
    console.log(`Total articles scoring >= 0.40: ${passing40.length} out of ${scored.length}\n`);

    const topicCounts40 = {};
    for (const t of profile.topics) topicCounts40[t.topic] = 0;
    for (const s of passing40) topicCounts40[s.topic] = (topicCounts40[s.topic] || 0) + 1;

    for (const [topic, count] of Object.entries(topicCounts40).sort((a, b) => b[1] - a[1])) {
      const pct = passing40.length > 0 ? ((count / passing40.length) * 100).toFixed(1) : '0.0';
      console.log(`  [${String(count).padStart(2)} | ${pct.padStart(5)}%] "${topic}"`);
    }

    // --- 2. MANUAL READ OF 0.40 - 0.50 BAND ---
    console.log('\n===============================================================');
    console.log('2. MANUAL READ: 0.40 - 0.50 BAND (The Decision Boundary)');
    console.log('===============================================================');
    const band40to50 = scored.filter(s => s.score >= 0.40 && s.score < 0.50);
    console.log(`Total articles in band: ${band40to50.length}\n`);

    band40to50.forEach((s, idx) => {
      console.log(`${idx + 1}. [Score: ${s.score.toFixed(4)} | RawSim: ${s.rawSim.toFixed(4)}]`);
      console.log(`   Source: [${s.source}]`);
      console.log(`   Title:  ${s.title}`);
      console.log(`   Topic:  "${s.topic}"\n`);
    });

    // --- 3. FALSE POSITIVE CHECK FOR ARTICLES >= 0.50 ---
    console.log('===============================================================');
    console.log('3. FALSE POSITIVE CHECK (Articles Scoring >= 0.50)');
    console.log('===============================================================');
    const passing50 = scored.filter(s => s.score >= 0.50);
    console.log(`Total articles scoring >= 0.50: ${passing50.length}\n`);

    passing50.forEach((s, idx) => {
      console.log(`${idx + 1}. [Score: ${s.score.toFixed(4)} | RawSim: ${s.rawSim.toFixed(4)}]`);
      console.log(`   Source: [${s.source}]`);
      console.log(`   Title:  ${s.title}`);
      console.log(`   Topic:  "${s.topic}"\n`);
    });

    // --- 4. RAW SIMILARITY CEILING REPORT ---
    console.log('===============================================================');
    console.log('4. RAW SIMILARITY CEILING REPORT');
    console.log('===============================================================');
    console.log(`Maximum Raw Cosine Similarity (across ALL 282 articles x 9 topics): ${maxRawSimOverall.toFixed(4)}`);
    console.log(`Top Raw Similarity Article: [${maxRawSimArticle.source}] "${maxRawSimArticle.title}"`);
    console.log(`Matched Against Topic: "${maxRawSimTopic}"\n`);

    const rawSimBuckets = {
      '>= 0.65': 0,
      '0.60 - 0.65': 0,
      '0.55 - 0.60': 0,
      '0.50 - 0.55': 0,
      '0.45 - 0.50': 0,
      '< 0.45': 0,
    };

    // Calculate maximum raw similarity for each article against ANY topic
    const maxRawPerArticle = primaryArticles.map(a => {
      let maxR = -Infinity;
      for (const t of profile.topics) {
        const sim = cosineSimilarity(a.embedding, t.embedding);
        if (sim > maxR) maxR = sim;
      }
      return maxR;
    });

    for (const r of maxRawPerArticle) {
      if (r >= 0.65) rawSimBuckets['>= 0.65']++;
      else if (r >= 0.60) rawSimBuckets['0.60 - 0.65']++;
      else if (r >= 0.55) rawSimBuckets['0.55 - 0.60']++;
      else if (r >= 0.50) rawSimBuckets['0.50 - 0.55']++;
      else if (r >= 0.45) rawSimBuckets['0.45 - 0.50']++;
      else rawSimBuckets['< 0.45']++;
    }

    console.log('Distribution of MAX Raw Similarity Per Article (before weight):');
    for (const [k, v] of Object.entries(rawSimBuckets)) {
      const pct = ((v / maxRawPerArticle.length) * 100).toFixed(1);
      console.log(`  ${k.padEnd(12)}: ${String(v).padStart(3)} (${pct}%)`);
    }

  } finally {
    await disconnectDB();
  }
}

runDiagnostics().catch(console.error);
