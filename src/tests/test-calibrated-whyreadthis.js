const config = require('../config');
const { connectDB, disconnectDB } = require('../db/connect');
const Article = require('../models/Article');

async function testCalibratedGeneration() {
  await connectDB();

  try {
    const borderlineArticles = await Article.find({
      isRelevant: true,
      rankingScore: { $lt: 0.25 },
    }).lean();

    console.log(`Testing calibrated whyReadThis on ${borderlineArticles.length} low-confidence/borderline articles...\n`);

    for (const article of borderlineArticles.slice(0, 4)) {
      const tier = 'low'; // rankingScore < 0.25

      const systemPrompt = `You are a concise, expert AI news curator.
Your task is to generate a neutral 2-3 sentence summary of what the article actually reports, and a 1-2 sentence honest reason ("whyReadThis") for someone interested in AI technology.
Rules:
1. "summary": Exactly 2-3 neutral, factual sentences covering what the article reports based ONLY on the provided title and snippet. Do not invent unmentioned facts.
2. "whyReadThis": Exactly 1-2 sentences. 
   CRITICAL HONESTY CONSTRAINT: The relevance confidence for this article is LOW / BORDERLINE (rankingScore: ${article.rankingScore.toFixed(3)}).
   - Do NOT invent, force, or hallucinate a connection to the user focus area that is not directly supported by the snippet.
   - Do NOT oversell. Acknowledge what the article is ACTUALLY about honestly (e.g. "Primarily a general overview of...", "A peripheral look at...", "Relevant only if you want broader context on...").
   - NEVER use internal jargon like "rankingScore", "matchedTopic", "algorithm", or "confidence tier".
3. Return ONLY a valid JSON object with keys "summary" and "whyReadThis". No markdown code blocks, no preamble.`;

      const userPrompt = `Article to analyze:
Title: "${article.title}"
Source: "${article.source}"
Snippet: "${article.snippet || 'No snippet provided.'}"
Assigned Focus Area: "${article.matchedTopic}"
Relevance Level: LOW / BORDERLINE (Do not oversell or force this topic connection)

Output JSON format:
{
  "summary": "...",
  "whyReadThis": "..."
}`;

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: config.GROQ_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.2,
          response_format: { type: 'json_object' },
        }),
      });

      const data = await res.json();
      const output = JSON.parse(data.choices[0].message.content);

      console.log('========================================================================');
      console.log(`Title:         "${article.title}"`);
      console.log(`Source:        [${article.source}]`);
      console.log(`Scores:        Raw=${article.bestRawSimilarity.toFixed(4)} | Rank=${article.rankingScore.toFixed(4)} (Tier: ${tier})`);
      console.log(`Topic:         "${article.matchedTopic.slice(0, 60)}..."`);
      console.log(`--- PREVIOUS whyReadThis (Overselling) ---`);
      console.log(article.whyReadThis);
      console.log(`--- REVISED whyReadThis (Calibrated/Honest) ---`);
      console.log(output.whyReadThis);
      console.log('========================================================================\n');
    }
  } finally {
    await disconnectDB();
  }
}

testCalibratedGeneration().catch(console.error);
