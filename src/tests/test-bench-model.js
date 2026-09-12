const config = require('../config');

async function testPrompt(model) {
  const start = Date.now();
  const systemPrompt = `You are a concise, expert AI news curator.
Your task is to generate a neutral 2-3 sentence summary of what the article actually reports, and a 1-2 sentence personalized reason ("whyReadThis") for someone interested in AI technology.
Rules:
1. "summary": Exactly 2-3 neutral, factual sentences covering what the article reports based ONLY on the provided title and snippet. Do not invent or hallucinate unmentioned facts.
2. "whyReadThis": Exactly 1-2 conversational sentences explaining why this matters to someone following this area. Mention the subject matter naturally (e.g. model releases, open-source tooling, agentic workflows). NEVER use internal system jargon like "matchedTopic", "similarity score", "algorithm", or "relevance gate".
3. Return ONLY a valid JSON object with keys "summary" and "whyReadThis". No markdown code blocks, no preamble, no postscript.`;

  const userPrompt = `Article to analyze:
Title: "OpenAI hails 'new era of artificial general intelligence' with Astra model release - The Guardian"
Source: "Google News AI"
Snippet: "OpenAI hails 'new era of artificial general intelligence' with Astra model release The Guardian. The model features 2x faster inference and improved multimodal reasoning."
Relevant Topic Area: "LLM Architecture, Frontier Model Releases & Open-Source Weights"

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
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      response_format: { type: 'json_object' },
    }),
  });

  const duration = Date.now() - start;
  const data = await res.json();
  console.log(`[${model}] Latency: ${duration}ms | Status: ${res.status}`);
  console.log(data.choices?.[0]?.message?.content);
}

testPrompt('openai/gpt-oss-20b').catch(console.error);
