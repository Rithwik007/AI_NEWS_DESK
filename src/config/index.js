const dotenv = require('dotenv');
dotenv.config();

/**
 * Central configuration for the AI news pipeline.
 * All tunable constants and environment variables live here.
 */
const config = {
  // MongoDB connection string — loaded from .env, never hardcoded
  MONGODB_URI: process.env.MONGODB_URI,

  // Configured news sources — each entry has name, type, and source-specific configuration
  NEWS_SOURCES: [
    // --- Tech Media RSS Feeds ---
    {
      name: 'TechCrunch AI',
      type: 'rss',
      url: 'https://techcrunch.com/category/artificial-intelligence/feed/',
    },
    {
      name: 'VentureBeat AI',
      type: 'rss',
      url: 'https://venturebeat.com/category/ai/feed/',
    },
    {
      name: 'MIT Technology Review',
      type: 'rss',
      url: 'https://www.technologyreview.com/feed/',
    },

    // --- Google News Parallel Queries ---
    {
      name: 'Google News: artificial intelligence',
      type: 'rss',
      url: 'https://news.google.com/rss/search?q=artificial+intelligence',
    },
    {
      name: 'Google News: machine learning',
      type: 'rss',
      url: 'https://news.google.com/rss/search?q=' + encodeURIComponent('"machine learning"'),
    },
    {
      name: 'Google News: large language model',
      type: 'rss',
      url: 'https://news.google.com/rss/search?q=' + encodeURIComponent('"large language model"'),
    },
    {
      name: 'Google News: generative AI',
      type: 'rss',
      url: 'https://news.google.com/rss/search?q=' + encodeURIComponent('"generative AI"'),
    },
    {
      name: 'Google News: GPT OR Claude OR Gemini',
      type: 'rss',
      url: 'https://news.google.com/rss/search?q=' + encodeURIComponent('GPT OR Claude OR Gemini'),
    },

    // --- Company Blogs ---
    {
      name: 'OpenAI Blog',
      type: 'rss',
      url: 'https://openai.com/news/rss.xml',
    },
    {
      name: 'Google DeepMind',
      type: 'rss',
      url: 'https://deepmind.google/blog/rss.xml',
    },
    {
      name: 'Meta AI Engineering',
      type: 'rss',
      url: 'https://engineering.fb.com/category/ai-research/feed/',
    },
    {
      name: 'Hugging Face Blog',
      type: 'rss',
      url: 'https://huggingface.co/blog/feed.xml',
    },

    // --- Community Discussions (Reddit) ---
    {
      name: 'Reddit r/MachineLearning',
      type: 'rss',
      url: 'https://www.reddit.com/r/MachineLearning/.rss',
    },
    {
      name: 'Reddit r/artificial',
      type: 'rss',
      url: 'https://www.reddit.com/r/artificial/.rss',
    },

    // --- Community Discussions (Hacker News Algolia API) ---
    {
      name: 'Hacker News (Algolia API)',
      type: 'algolia-api',
      url: 'https://hn.algolia.com/api/v1/search_by_date',
      params: {
        tags: 'story',
        query: 'AI',
        minPoints: 5,
      },
    },
  ],
  // Retain RSS_FEEDS alias for backward compatibility
  get RSS_FEEDS() {
    return this.NEWS_SOURCES;
  },

  // --- Deduplication Tuning ---

  // Cosine similarity threshold for clustering articles as "same story".
  // Set to 0.72 based on first real-data verification (2026-08-25):
  //   - 0.75 missed a clear duplicate (Jalapeño chip, sim=0.7427)
  //   - Nearest false positive at 0.686 (different stories, both OpenAI security)
  //   - Gives 3.4% margin above nearest false positive
  // PROVISIONAL — based on N=1 day's data (95 articles, 3 near-threshold pairs).
  // Re-evaluate after more data accumulates. Known limitation: threshold-based
  // Union-Find can miss transitive chains where individual pairwise links
  // fall just below threshold even though the stories are clearly related.
  SIMILARITY_THRESHOLD: 0.72,

  // --- Relevance Filtering Tuning (Step 2) ---

  // Minimum RAW cosine similarity across all topics required to consider an article relevant (Pass/Fail Gate).
  // Weight is NOT applied at this gate to avoid locking out lower-weighted topics.
  // INITIAL GUESS (0.45): PROVISIONAL — requires real-data validation.
  RAW_SIMILARITY_THRESHOLD: parseFloat(process.env.RAW_SIMILARITY_THRESHOLD) || 0.45,

  // Retained for backward compatibility if referenced elsewhere
  RELEVANCE_THRESHOLD: parseFloat(process.env.RELEVANCE_THRESHOLD) || 0.45,

  // Only keep articles published within this many hours
  // Override via env var for testing (e.g., ARTICLE_MAX_AGE_HOURS=72 for cross-run dedup verification)
  ARTICLE_MAX_AGE_HOURS: parseInt(process.env.ARTICLE_MAX_AGE_HOURS, 10) || 24,

  // Embedding model — small, fast, 384-dim vectors, ~23MB ONNX download
  EMBEDDING_MODEL: 'Xenova/all-MiniLM-L6-v2',

  // --- Groq Summarization & Conversational Chat ---
  // Collect all available Groq API keys for automatic failover and rotation
  GROQ_API_KEYS: [
    process.env.GROQ_API_KEY,
    process.env.API_2,
    process.env.API_3,
    process.env.API_4,
    process.env.API_5,
    process.env.GROQ_API_KEY_2,
    process.env.GROQ_API_KEY_3,
    process.env.GROQ_API_KEY_4,
    process.env.GROQ_API_KEY_5,
  ].filter(Boolean),
  GROQ_API_KEY: process.env.GROQ_API_KEY || process.env.API_2 || '',
  // openai/gpt-oss-20b selected for speed (~1000ms latency), native JSON mode, and high accuracy
  GROQ_MODEL: process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
  // Delay between Groq API calls to stay within free-tier 30 RPM limit
  GROQ_RATE_LIMIT_DELAY_MS: parseInt(process.env.GROQ_RATE_LIMIT_DELAY_MS, 10) || 1500,

  // --- Telegram Delivery (Step 4) ---
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
  // Delay between message sends to stay within Telegram rate limits
  TELEGRAM_SEND_DELAY_MS: parseInt(process.env.TELEGRAM_SEND_DELAY_MS, 10) || 1500,
  // Delivery mode: 'top5' (default, top 5 high/moderate articles in 1 message) or 'all_tiers' (legacy, all articles grouped by tier)
  DELIVERY_MODE: process.env.DELIVERY_MODE || 'top5',
  // Maximum articles to deliver when in top stories mode
  TOP_STORIES_LIMIT: parseInt(process.env.TOP_STORIES_LIMIT, 10) || 5,
  // Delivery schedule run type: 'morning' (8 AM, full 24h top-5) or 'evening' (6 PM, incremental since morning run)
  RUN_TYPE: process.env.RUN_TYPE || 'morning',

  // --- Clerk Authentication (Step 5) ---
  CLERK_PUBLISHABLE_KEY: process.env.CLERK_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
  PORT: parseInt(process.env.PORT, 10) || 3000,

  // --- Telegram Conversational Chat & Digest Resend ---
  CHAT_HOURLY_RATE_LIMIT: parseInt(process.env.CHAT_HOURLY_RATE_LIMIT, 10) || 20,
  CHAT_HISTORY_LIMIT: parseInt(process.env.CHAT_HISTORY_LIMIT, 10) || 20,
  CHAT_PRUNE_DAYS: parseInt(process.env.CHAT_PRUNE_DAYS, 10) || 30,
  GROQ_CHAT_MODEL: process.env.GROQ_CHAT_MODEL || process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
};

// Ensure Clerk SDK finds publishable key if only NEXT_PUBLIC_ is set
if (!process.env.CLERK_PUBLISHABLE_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
  process.env.CLERK_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
}

// Validate required config
if (!config.MONGODB_URI) {
  throw new Error('MONGODB_URI is required in .env — see .env.example');
}

module.exports = config;
