const RSSParser = require('rss-parser');
const config = require('../config');

// Standard parser with realistic user agent and timeout
const parser = new RSSParser({
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 AI-News-Bot/1.0 (by /u/newsbot)',
    'Accept': 'application/rss+xml, application/xml, text/xml, */*',
  },
  timeout: 12000,
});

/**
 * Strip HTML tags from RSS description fields.
 */
function stripHTML(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').trim();
}

/**
 * Sleep helper for retry delay.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if an article was published within the allowed time window.
 */
function isWithinTimeWindow(dateStr) {
  if (!dateStr) return false;
  const publishedAt = new Date(dateStr);
  const cutoff = new Date(Date.now() - config.ARTICLE_MAX_AGE_HOURS * 60 * 60 * 1000);
  return publishedAt >= cutoff;
}

/**
 * Fetch RSS feed with retry on 429 rate-limit or network timeout.
 */
async function fetchRSSWithRetry(source, maxRetries = 1) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const parsed = await parser.parseURL(source.url);
      return parsed;
    } catch (error) {
      const isRateLimited = error.message && (error.message.includes('429') || error.message.includes('Status code 429'));
      const isTimeout = error.message && (error.message.includes('timeout') || error.message.includes('ETIMEDOUT'));

      if ((isRateLimited || isTimeout) && attempt < maxRetries) {
        const delayMs = 3000;
        console.warn(`[RSS] ⚠ ${source.name} hit ${isRateLimited ? '429 Rate Limit' : 'timeout'}. Retrying in ${delayMs / 1000}s (attempt ${attempt + 1}/${maxRetries})...`);
        await sleep(delayMs);
        continue;
      }
      throw error;
    }
  }
}

/**
 * Fetch stories from Hacker News via Algolia API.
 */
async function fetchAlgoliaHN(source) {
  const cutoffSeconds = Math.floor((Date.now() - config.ARTICLE_MAX_AGE_HOURS * 60 * 60 * 1000) / 1000);
  const query = encodeURIComponent(source.params?.query || 'AI');
  const tags = encodeURIComponent(source.params?.tags || 'story');
  const minPoints = source.params?.minPoints || 5;

  const url = `${source.url}?tags=${tags}&query=${query}&numericFilters=${encodeURIComponent(`points>=${minPoints},created_at_i>${cutoffSeconds}`)}&hitsPerPage=50`;

  const fetchFn = globalThis.fetch || require('node-fetch');
  const response = await fetchFn(url, {
    headers: {
      'User-Agent': 'AI-News-Delivery-Pipeline/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`Algolia API HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  const hits = data.hits || [];

  return hits
    .map((item) => ({
      source: source.name,
      title: (item.title || '').trim(),
      url: (item.url || `https://news.ycombinator.com/item?id=${item.objectID}`).trim(),
      publishedAt: new Date(item.created_at || item.created_at_i * 1000),
      snippet: stripHTML(item.story_text || item.comment_text || `HN Points: ${item.points || 0} | Comments: ${item.num_comments || 0}`),
    }))
    .filter((a) => a.url && a.title);
}

/**
 * Fetch articles from all configured sources.
 * Supports both RSS and API-driven sources (e.g. Algolia).
 */
async function fetchAllFeeds() {
  const allArticles = [];
  const sources = config.NEWS_SOURCES || config.RSS_FEEDS;

  for (const source of sources) {
    try {
      console.log(`[Source] Fetching: ${source.name} [type: ${source.type || 'rss'}]`);

      let articlesFromSource = [];

      if (source.type === 'algolia-api') {
        articlesFromSource = await fetchAlgoliaHN(source);
      } else {
        // Default to RSS
        const parsed = await fetchRSSWithRetry(source, 1);

        if (!parsed.items || parsed.items.length === 0) {
          console.warn(`[Source] ⚠ ${source.name}: returned 0 items, skipping`);
          continue;
        }

        articlesFromSource = parsed.items
          .filter((item) => {
            const dateStr = item.isoDate || item.pubDate || item.date;
            return isWithinTimeWindow(dateStr);
          })
          .map((item) => ({
            source: source.name,
            title: (item.title || '').trim(),
            url: (item.link || item.guid || '').trim(),
            publishedAt: new Date(item.isoDate || item.pubDate || item.date || Date.now()),
            snippet: stripHTML(item.contentSnippet || item.content || item.summary || ''),
          }))
          .filter((article) => article.url && article.title);
      }

      allArticles.push(...articlesFromSource);
      console.log(`[Source] ✓ ${source.name}: ${articlesFromSource.length} articles (last ${config.ARTICLE_MAX_AGE_HOURS}h)`);
    } catch (error) {
      // Log warning and keep going with remaining sources
      console.warn(`[Source] ⚠ ${source.name} failed: ${error.message}`);
    }
  }

  console.log(`[Source] Total articles fetched across all sources: ${allArticles.length}`);
  return allArticles;
}

module.exports = { fetchAllFeeds };
