const { connectDB, disconnectDB } = require('../db/connect');
const Article = require('../models/Article');

async function testSpamPatterns() {
  await connectDB();

  try {
    const articles = await Article.find({ isPrimary: true }, {
      title: 1, source: 1, snippet: 1
    }).lean();

    console.log(`Auditing patterns against all ${articles.length} primary articles in DB...\n`);

    // 1. Audit /\b(stocks?|shares?)\b/i across all 282 articles
    console.log('===============================================================');
    console.log('1. ALL ARTICLES MATCHING /\\b(stocks?|shares?)\\b/i:');
    console.log('===============================================================');

    const broadStockRegex = /\b(stocks?|shares?)\b/i;
    const stockMatches = articles.filter(a => broadStockRegex.test(a.title));

    console.log(`Total matching: ${stockMatches.length}\n`);
    stockMatches.forEach((a, i) => {
      console.log(`${i + 1}. [${a.source}] "${a.title}"`);
    });

    // 2. Audit other proposed patterns across all 282 articles to verify if any legitimate article is caught
    console.log('\n===============================================================');
    console.log('2. AUDITING OTHER PROPOSED FILTER PATTERNS ACROSS ALL ARTICLES:');
    console.log('===============================================================');

    const otherPatterns = [
      { name: 'market report', regex: /\bmarket reports?\b/i },
      { name: 'market size to reach/forecast', regex: /\bmarket size (to reach|forecast)\b/i },
      { name: 'forecast to hit $X Bn', regex: /\bforecast to hit \$\d+(\.\d+)?\s*(bn|billion|trillion)\b/i },
      { name: 'CAGR of X%', regex: /\bCAGR of \d+(\.\d+)?%/i },
      { name: 'comprehensive asset tracking', regex: /\bcomprehensive\s*asset tracking\b/i },
      { name: 'fellowship', regex: /\bfellowship (202\d|application)\b/i },
      { name: 'certifications promo', regex: /\b(launches|boost) \d+ new (AI )?certifications\b/i },
      { name: 'free video generator', regex: /\bfree (AI )?video generator\b/i },
      { name: 'school curriculum', regex: /\bschool curriculum\b/i },
    ];

    for (const p of otherPatterns) {
      const matches = articles.filter(a => p.regex.test(a.title));
      console.log(`Pattern [${p.name}]: ${matches.length} matches`);
      matches.forEach(m => console.log(`   - [${m.source}] "${m.title}"`));
    }

    // 3. Test Tightened Stock Pattern
    console.log('\n===============================================================');
    console.log('3. TESTING TIGHTENED STOCK/MARKET SPECULATION PATTERN:');
    console.log('===============================================================');

    // Tightened pattern: requires explicit financial advice, ticker speculation, or price target cues
    const tightenedStockPattern = /\b(stocks?|shares?)\b.*?\b(better buy|screaming buy|buy after|biggest winner|could soar|soar by|buy right now|price target|buy rating|top pick|strong buy|bull case|bear case|to buy now)\b|\b(better buy|screaming buy|buy after earnings|buy rating|price target|wall street targets)\b/i;

    const tightenedMatches = articles.filter(a => tightenedStockPattern.test(a.title));
    console.log(`Total caught by tightened stock pattern: ${tightenedMatches.length}\n`);
    tightenedMatches.forEach((m, i) => {
      console.log(`${i + 1}. [${m.source}] "${m.title}"`);
    });

  } finally {
    await disconnectDB();
  }
}

testSpamPatterns().catch(console.error);
