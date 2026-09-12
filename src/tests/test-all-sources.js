const { fetchAllFeeds } = require('../services/fetchRSS');

async function testFetch() {
  console.log('Testing fetchAllFeeds across all configured news sources...\n');
  const articles = await fetchAllFeeds();
  console.log('\n================ FETCH SUMMARY ================');
  console.log('Total articles fetched:', articles.length);

  const bySource = {};
  for (const a of articles) {
    bySource[a.source] = (bySource[a.source] || 0) + 1;
  }

  for (const [sourceName, count] of Object.entries(bySource)) {
    console.log(`✓ ${sourceName}: ${count} articles`);
  }

  // Check sample output structure
  if (articles.length > 0) {
    console.log('\nSample Article Shape:');
    console.log({
      source: articles[0].source,
      title: articles[0].title.slice(0, 60),
      url: articles[0].url.slice(0, 70),
      publishedAt: articles[0].publishedAt,
      snippetLength: articles[0].snippet.length,
    });
  }
}

testFetch().catch(console.error);
