const { connectDB, disconnectDB } = require('../db/connect');
const Article = require('../models/Article');
const InterestProfile = require('../models/InterestProfile');
const { scoreRelevance } = require('../services/relevance');

// Keyword exclusion patterns (Belt + Suspenders)
const SPAM_PATTERNS = [
  // Stock market & trading spam
  /\b(stocks?|shares?)\b.*\b(soar|buy|surge|rally|screaming buy|gain|plunge|dip)\b/i,
  /\b(buy rating|price target|wall street|bull market|bear market)\b/i,
  /\b(which (AI |artificial intelligence )?chipmaker is the better buy)\b/i,
  // Market research reports & SEO spam
  /\bmarket report\b/i,
  /\bmarket size (to reach|forecast)\b/i,
  /\bforecast to hit \$\d+(\.\d+)?\s*(bn|billion|trillion)\b/i,
  /\bCAGR of \d+(\.\d+)?%/i,
  /\bcomprehensive\s*asset tracking\b/i,
  // Corporate training, fellowships, student applications
  /\bfellowship (202\d|application)\b/i,
  /\b(launches|boost) \d+ new (AI )?certifications\b/i,
  /\bfree (AI )?video generator\b/i,
];

function isSpamByKeyword(title) {
  if (!title) return { isSpam: false, matchedRule: null };
  for (const pattern of SPAM_PATTERNS) {
    if (pattern.test(title)) {
      return { isSpam: true, matchedRule: pattern.toString() };
    }
  }
  return { isSpam: false, matchedRule: null };
}

async function runAnalysis() {
  await connectDB();

  try {
    const profile = await InterestProfile.findOne({ userId: 'default-user' }).lean();
    const primaryArticles = await Article.find({ isPrimary: true }, {
      title: 1, source: 1, snippet: 1, embedding: 1
    }).lean();

    const scored = [];
    for (const a of primaryArticles) {
      if (!a.embedding?.length) continue;
      const res = scoreRelevance(a.embedding, profile.topics);
      const spamCheck = isSpamByKeyword(a.title);
      scored.push({
        title: a.title,
        source: a.source,
        rawSim: res.bestRawSimilarity,
        rankingScore: res.rankingScore,
        matchedTopic: res.matchedTopic,
        isSpam: spamCheck.isSpam,
        matchedRule: spamCheck.matchedRule,
      });
    }

    scored.sort((a, b) => b.rawSim - a.rawSim);

    // --- PART 1: CLASSIFY ALL 12 ARTICLES SCORING >= 0.50 ---
    console.log('================================================================');
    console.log('1. CLASSIFICATION OF ALL 12 ARTICLES SCORING >= 0.50');
    console.log('================================================================\n');

    const band50 = scored.filter(s => s.rawSim >= 0.50);
    band50.forEach((s, i) => {
      console.log(`P_${i + 1} | Raw: ${s.rawSim.toFixed(4)} | Rank: ${s.rankingScore.toFixed(4)} | [${s.source}]`);
      console.log(`    Title: "${s.title}"`);
      console.log(`    Topic: "${s.matchedTopic.slice(0, 50)}..."\n`);
    });

    // --- PART 2 & 3: EFFECT OF KEYWORD FILTER ON 0.450 - 0.499 BAND ---
    console.log('================================================================');
    console.log('2 & 3. KEYWORD PRE-FILTER EFFECT ON 0.450 - 0.499 BAND');
    console.log('================================================================\n');

    const band45 = scored.filter(s => s.rawSim >= 0.45 && s.rawSim < 0.50);
    console.log(`Total articles in band: ${band45.length}`);

    const spamInBand45 = band45.filter(s => s.isSpam);
    const cleanInBand45 = band45.filter(s => !s.isSpam);

    console.log(`Caught by keyword filter: ${spamInBand45.length}`);
    console.log(`Remaining in band:       ${cleanInBand45.length}\n`);

    console.log('--- CAUGHT SPAM ARTICLES IN 0.450 - 0.499 BAND ---');
    spamInBand45.forEach((s, i) => {
      console.log(`${i + 1}. [Filtered: ${s.matchedRule}]`);
      console.log(`   Title: "${s.title}" (Raw: ${s.rawSim.toFixed(4)})\n`);
    });

    console.log('--- REMAINING ARTICLES IN 0.450 - 0.499 BAND AFTER KEYWORD FILTER ---');
    cleanInBand45.forEach((s, i) => {
      console.log(`${i + 1}. Raw: ${s.rawSim.toFixed(4)} | [${s.source}] "${s.title}"`);
    });

  } finally {
    await disconnectDB();
  }
}

runAnalysis().catch(console.error);
