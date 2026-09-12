const { connectDB, disconnectDB } = require('../db/connect');
const Article = require('../models/Article');
const InterestProfile = require('../models/InterestProfile');
const { scoreRelevance } = require('../services/relevance');

async function analyzeRelevanceScores() {
  await connectDB();

  try {
    const profile = await InterestProfile.findOne({ userId: 'default-user' }).lean();
    if (!profile) {
      console.error('No interest profile found!');
      return;
    }

    // Find all primary articles stored across DB
    const primaryArticles = await Article.find({ isPrimary: true }, {
      title: 1, source: 1, embedding: 1, relevanceScore: 1, matchedTopic: 1, isRelevant: 1, clusterId: 1
    }).lean();

    console.log(`\n======================================================`);
    console.log(`RELEVANCE DISTRIBUTION ANALYSIS`);
    console.log(`Total primary articles in database: ${primaryArticles.length}`);
    console.log(`======================================================\n`);

    const scored = [];
    for (const a of primaryArticles) {
      if (a.embedding && a.embedding.length > 0) {
        const res = scoreRelevance(a.embedding, profile.topics);
        scored.push({
          title: a.title,
          source: a.source,
          score: res.relevanceScore,
          topic: res.matchedTopic,
          rawSim: res.rawSimilarity,
        });
      }
    }

    scored.sort((a, b) => b.score - a.score);

    // Buckets
    const buckets = {
      '>= 0.50': 0,
      '0.45 - 0.50': 0,
      '0.40 - 0.45': 0,
      '0.35 - 0.40': 0,
      '0.30 - 0.35': 0,
      '0.25 - 0.30': 0,
      '< 0.25': 0,
    };

    for (const s of scored) {
      if (s.score >= 0.50) buckets['>= 0.50']++;
      else if (s.score >= 0.45) buckets['0.45 - 0.50']++;
      else if (s.score >= 0.40) buckets['0.40 - 0.45']++;
      else if (s.score >= 0.35) buckets['0.35 - 0.40']++;
      else if (s.score >= 0.30) buckets['0.30 - 0.35']++;
      else if (s.score >= 0.25) buckets['0.25 - 0.30']++;
      else buckets['< 0.25']++;
    }

    console.log('--- SCORE DISTRIBUTION (Weighted-Max) ---');
    for (const [range, count] of Object.entries(buckets)) {
      const pct = ((count / scored.length) * 100).toFixed(1);
      const bar = '#'.repeat(Math.round(count / 2));
      console.log(`  ${range.padEnd(12)}: ${String(count).padStart(3)} (${pct.padStart(5)}%) ${bar}`);
    }

    console.log('\n--- TOP 10 HIGHEST SCORING ARTICLES ---');
    for (let i = 0; i < Math.min(10, scored.length); i++) {
      const s = scored[i];
      console.log(`${i + 1}. [Score: ${s.score.toFixed(4)} | RawSim: ${s.rawSim.toFixed(4)}]`);
      console.log(`   Title: [${s.source}] ${s.title}`);
      console.log(`   Topic: "${s.topic}"\n`);
    }

    console.log('--- BOTTOM 5 LOWEST SCORING ARTICLES ---');
    for (let i = Math.max(0, scored.length - 5); i < scored.length; i++) {
      const s = scored[i];
      console.log(`- [Score: ${s.score.toFixed(4)} | RawSim: ${s.rawSim.toFixed(4)}]`);
      console.log(`  Title: [${s.source}] ${s.title}`);
      console.log(`  Topic: "${s.topic}"\n`);
    }

    // Breakdown of top topics
    const topicCount = {};
    for (const s of scored) {
      topicCount[s.topic] = (topicCount[s.topic] || 0) + 1;
    }
    console.log('--- TOPIC MATCH FREQUENCY ACROSS ALL ARTICLES ---');
    for (const [t, c] of Object.entries(topicCount).sort((a, b) => b[1] - a[1])) {
      console.log(`  - [${c}] ${t}`);
    }

  } finally {
    await disconnectDB();
  }
}

analyzeRelevanceScores().catch(console.error);
