const { connectDB, disconnectDB } = require('../db/connect');
const Article = require('../models/Article');
const InterestProfile = require('../models/InterestProfile');
const { cosineSimilarity } = require('../services/dedup');
const { scoreRelevance } = require('../services/relevance');

async function investigate() {
  await connectDB();

  try {
    const profile = await InterestProfile.findOne({ userId: 'default-user' }).lean();
    const primaryArticles = await Article.find({ isPrimary: true }, {
      title: 1, source: 1, snippet: 1, embedding: 1
    }).lean();

    console.log(`Total primary articles: ${primaryArticles.length}\n`);

    // --- PART 1: LLM Architecture Topic Deep Dive ---
    const llmTopic = profile.topics.find(t => t.topic.includes('LLM architecture'));
    console.log('===============================================================');
    console.log(`1. DEEP DIVE: "${llmTopic.topic}"`);
    console.log('===============================================================');

    const llmMatches = [];
    for (const a of primaryArticles) {
      if (!a.embedding || !a.embedding.length) continue;
      const rawSim = cosineSimilarity(a.embedding, llmTopic.embedding);
      llmMatches.push({
        title: a.title,
        source: a.source,
        rawSim,
      });
    }

    llmMatches.sort((a, b) => b.rawSim - a.rawSim);
    console.log(`Top raw similarity for LLM architecture: ${llmMatches[0]?.rawSim.toFixed(4)}\n`);
    console.log('Top 10 articles by raw similarity against LLM architecture topic ALONE:');
    llmMatches.slice(0, 10).forEach((m, i) => {
      console.log(`${i + 1}. [RawSim: ${m.rawSim.toFixed(4)}] [${m.source}] ${m.title}`);
    });

    // Check individual ceilings for all 9 topics
    console.log('\n--- MAX CEILING COMPARISON ACROSS ALL 9 TOPICS ---');
    for (const t of profile.topics) {
      let maxSim = -Infinity;
      let bestArt = null;
      for (const a of primaryArticles) {
        if (!a.embedding || !a.embedding.length) continue;
        const sim = cosineSimilarity(a.embedding, t.embedding);
        if (sim > maxSim) {
          maxSim = sim;
          bestArt = a;
        }
      }
      console.log(`- Ceiling: ${maxSim.toFixed(4)} | "${t.topic}" (Best: "${bestArt?.title.slice(0, 45)}...")`);
    }

    // --- PART 2: MANUAL READ OF 0.450 - 0.499 PASS ZONE ---
    console.log('\n===============================================================');
    console.log('2. FULL READ: 0.450 - 0.499 PASS ZONE ARTICLES');
    console.log('===============================================================');

    const scored = [];
    for (const a of primaryArticles) {
      if (!a.embedding || !a.embedding.length) continue;
      const res = scoreRelevance(a.embedding, profile.topics);
      if (res.bestRawSimilarity >= 0.45 && res.bestRawSimilarity < 0.50) {
        scored.push({
          title: a.title,
          source: a.source,
          rawSim: res.bestRawSimilarity,
          topic: res.matchedTopic,
        });
      }
    }

    scored.sort((a, b) => b.rawSim - a.rawSim);
    console.log(`Total articles in 0.450 - 0.499 band: ${scored.length}\n`);

    scored.forEach((s, i) => {
      console.log(`ITEM_${i + 1}|${s.rawSim.toFixed(4)}|[${s.source}]|${s.title}|TOPIC: ${s.topic}`);
    });

  } finally {
    await disconnectDB();
  }
}

investigate().catch(console.error);
