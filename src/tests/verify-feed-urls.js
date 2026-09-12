const RSSParser = require('rss-parser');
const parser = new RSSParser({
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 AI-News-Bot/1.0'
  },
  timeout: 10000,
});

const urls = [
  { name: 'OpenAI Blog', url: 'https://openai.com/news/rss.xml' },
  { name: 'OpenAI Blog Alt', url: 'https://openai.com/blog/rss.xml' },
  { name: 'Anthropic Blog', url: 'https://www.anthropic.com/feed' },
  { name: 'Anthropic Blog Alt', url: 'https://www.anthropic.com/news/rss' },
  { name: 'Google DeepMind', url: 'https://deepmind.google/blog/rss.xml' },
  { name: 'Google DeepMind Alt', url: 'https://deepmind.google/discover/blog/rss.xml' },
  { name: 'Meta AI Blog', url: 'https://ai.meta.com/blog/rss.xml' },
  { name: 'Meta AI Engineering', url: 'https://engineering.fb.com/category/ai-research/feed/' },
  { name: 'Mistral AI', url: 'https://mistral.ai/news/index.xml' },
  { name: 'Mistral AI Alt', url: 'https://mistral.ai/feed.xml' },
  { name: 'Hugging Face Blog', url: 'https://huggingface.co/blog/feed.xml' },
  { name: 'Reddit r/MachineLearning', url: 'https://www.reddit.com/r/MachineLearning/.rss' },
  { name: 'Reddit r/artificial', url: 'https://www.reddit.com/r/artificial/.rss' },
  { name: 'Google News: "machine learning"', url: 'https://news.google.com/rss/search?q=' + encodeURIComponent('"machine learning"') },
  { name: 'Google News: "large language model"', url: 'https://news.google.com/rss/search?q=' + encodeURIComponent('"large language model"') },
  { name: 'Google News: "generative AI"', url: 'https://news.google.com/rss/search?q=' + encodeURIComponent('"generative AI"') },
  { name: 'Google News: GPT OR Claude OR Gemini', url: 'https://news.google.com/rss/search?q=' + encodeURIComponent('GPT OR Claude OR Gemini') },
];

async function testFeeds() {
  for (const f of urls) {
    try {
      const res = await parser.parseURL(f.url);
      console.log(`[PASS] ${f.name} -> ${res.items?.length || 0} items. Sample title: ${res.items?.[0]?.title?.slice(0, 60)}`);
    } catch (e) {
      console.log(`[FAIL] ${f.name} (${f.url}) -> ${e.message}`);
    }
  }
}

testFeeds();
