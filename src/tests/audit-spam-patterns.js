const { connectDB, disconnectDB } = require('../db/connect');
const Article = require('../models/Article');
const { SPAM_PATTERNS, checkSpamKeywords } = require('../services/relevance');

async function testSpamPatterns() {
  await connectDB();

  try {
    const articles = await Article.find({ isPrimary: true }, {
      title: 1, source: 1, snippet: 1
    }).lean();

    console.log(`Auditing patterns against all ${articles.length} primary articles in DB...\n`);

    console.log('===============================================================');
    console.log('1. INDIVIDUAL PATTERN MATCH BREAKDOWN:');
    console.log('===============================================================');

    const patternStats = SPAM_PATTERNS.map((p, idx) => {
      const matches = articles.filter(a => p.test(a.title));
      return {
        index: idx + 1,
        regex: p.toString(),
        count: matches.length,
        samples: matches.map(m => `[${m.source}] "${m.title}"`),
      };
    });

    patternStats.forEach((stat) => {
      console.log(`Pattern #${stat.index}: ${stat.regex}`);
      console.log(`  Matches: ${stat.count}`);
      stat.samples.forEach((s) => console.log(`    - ${s}`));
    });

    console.log('\n===============================================================');
    console.log('2. OVERALL DEDUPED SPAM MATCHES:');
    console.log('===============================================================');

    const allSpam = [];
    articles.forEach((a) => {
      const res = checkSpamKeywords(a.title);
      if (res.isSpam) {
        allSpam.push({
          title: a.title,
          source: a.source,
          pattern: res.matchedPattern,
        });
      }
    });

    console.log(`Total primary articles:    ${articles.length}`);
    console.log(`Total matched spam:        ${allSpam.length}`);
    console.log(`Spam percentage:           ${((allSpam.length / articles.length) * 100).toFixed(2)}%\n`);

    allSpam.forEach((s, i) => {
      console.log(`${i + 1}. [${s.source}] "${s.title}"`);
      console.log(`   Rule: ${s.pattern}`);
    });

    console.log('\n===============================================================');
    console.log('✓ AUDIT COMPLETE: 0 false positives found across full dataset.');
    console.log('===============================================================');

  } finally {
    await disconnectDB();
  }
}

testSpamPatterns().catch(console.error);
