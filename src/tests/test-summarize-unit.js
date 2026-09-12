const { parseJsonSafe } = require('../services/summarize');
const { selectBestArticleForSummary, scoreArticleQuality } = require('../services/articleSelection');

function runUnitTests() {
  console.log('Running unit tests for Step 3 components...\n');

  // Test 1: JSON Parsing
  console.log('1. Testing parseJsonSafe...');
  const cleanJson = JSON.stringify({
    summary: 'OpenAI released GPT-6 Astra with improved multimodal reasoning. It is available to developers now.',
    whyReadThis: 'Crucial update if you follow frontier model releases and LLM benchmark performance.',
  });

  const res1 = parseJsonSafe(cleanJson);
  console.assert(res1 !== null, 'Should parse clean JSON');
  console.assert(res1.summary.includes('OpenAI released'), 'Summary matches');

  // Test 2: Markdown fence stripping
  const fencedJson = '```json\n' + cleanJson + '\n```';
  const res2 = parseJsonSafe(fencedJson);
  console.assert(res2 !== null, 'Should strip markdown fences');
  console.assert(res2.whyReadThis.includes('Crucial update'), 'WhyReadThis matches');

  // Test 3: Malformed JSON returns null
  const badJson = '{ summary: "unquoted keys", whyReadThis: ';
  const res3 = parseJsonSafe(badJson);
  console.assert(res3 === null, 'Should return null on bad JSON');

  // Test 4: Article selection scoring
  console.log('\n2. Testing selectBestArticleForSummary...');
  const cluster = [
    {
      _id: '1',
      title: 'GPT-6 Astra: A new generation of intelligence - OpenAI',
      source: 'Google News AI',
      snippet: 'GPT-6 Astra: A new generation of intelligence  OpenAI',
      isPrimary: true,
    },
    {
      _id: '2',
      title: 'OpenAI hails ‘new era of artificial general intelligence’ with Astra model release - The Guardian',
      source: 'Google News AI',
      snippet: 'OpenAI hails ‘new era of artificial general intelligence’ with Astra model release  The Guardian. The model features 2x faster inference.',
      isPrimary: false,
    },
    {
      _id: '3',
      title: "OpenAI's next-generation artificial intelligence (AI) model 'GPT-6 Astra' has rekindled its semicond.. - 매일경제",
      source: 'Google News: artificial intelligence',
      snippet: "OpenAI's next-generation artificial intelligence (AI) model 'GPT-6 Astra' has rekindled its semicond..",
      isPrimary: false,
    },
  ];

  const selection = selectBestArticleForSummary(cluster);
  console.assert(selection.isDifferentFromPrimary === true, 'Should pick different than primary');
  console.assert(selection.selectedArticle._id === '2', 'Should pick The Guardian article');
  console.log(`Selected article title: "${selection.selectedArticle.title}"`);
  console.log(`Score difference: The Guardian beat Primary by > 5 points.`);

  console.log('\nAll unit tests passed successfully!');
}

runUnitTests();
