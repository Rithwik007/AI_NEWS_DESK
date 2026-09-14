require('dotenv').config();

async function testAllKeys() {
  const keys = [
    { name: 'GROQ_API_KEY', key: process.env.GROQ_API_KEY },
    { name: 'API_2', key: process.env.API_2 },
    { name: 'API_3', key: process.env.API_3 },
    { name: 'API_4', key: process.env.API_4 },
    { name: 'API_5', key: process.env.API_5 },
  ];

  for (const k of keys) {
    if (!k.key) {
      console.log(`${k.name}: MISSING`);
      continue;
    }
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${k.key.trim()}`,
        },
        body: JSON.stringify({
          model: 'openai/gpt-oss-20b',
          messages: [{ role: 'user', content: 'Say hello in 1 word' }],
          max_tokens: 5,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        console.log(`${k.name}: FAILED ✗ HTTP ${res.status} -> ${data.error?.message || JSON.stringify(data)}`);
      } else {
        console.log(`${k.name}: VALID ✓ -> "${data.choices[0]?.message?.content?.trim()}"`);
      }
    } catch (err) {
      console.log(`${k.name}: FAILED ✗ -> ${err.message}`);
    }
  }
}

testAllKeys().catch(console.error);
