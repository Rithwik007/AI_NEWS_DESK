const config = require('../config');

async function testModel(model) {
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + config.GROQ_API_KEY,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Say hello in valid JSON: {"hello": "world"}' }],
        response_format: { type: 'json_object' },
      }),
    });
    const data = await res.json();
    console.log(model, 'status:', res.status, data.choices?.[0]?.message?.content || data.error?.message);
  } catch (e) {
    console.log(model, 'error:', e.message);
  }
}

async function run() {
  await testModel('openai/gpt-oss-20b');
  await testModel('groq/compound-mini');
  await testModel('qwen/qwen3.8-27b');
  await testModel('openai/gpt-oss-120b');
}

run();
