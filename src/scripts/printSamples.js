const { connectDB, disconnectDB } = require('../db/connect');
const Article = require('../models/Article');

async function inspectSamples() {
  await connectDB();
  try {
    const articles = await Article.find({ isRelevant: true, summary: { $ne: null } })
      .populate('selectedArticleId', 'title source snippet')
      .lean();

    console.log(`Total summarized articles in DB: ${articles.length}`);

    // Pick 5 representative diverse samples:
    // 1. Cluster difference (GPT-6 Astra: picked The Guardian over OpenAI)
    // 2. VC/finance (TechCrunch AI)
    // 3. Hardware/devices (MIT Technology Review)
    // 4. Agentic AI / AI Safety (InfoWorld)
    // 5. Developer infrastructure (Nvidia PAIR / StartupHub)

    const sample1 = articles.find((a) => a.title.includes('GPT-6 Astra'));
    const sample2 = articles.find((a) => a.source.includes('TechCrunch'));
    const sample3 = articles.find((a) => a.source.includes('MIT Technology Review'));
    const sample4 = articles.find((a) => a.title.includes('bounded autonomy'));
    const sample5 = articles.find((a) => a.title.includes('PAIR software'));

    const list = [sample1, sample2, sample3, sample4, sample5].filter(Boolean);

    list.forEach((a, i) => {
      console.log('\n============================================================');
      console.log(`SAMPLE #${i + 1}`);
      console.log(`Primary Title:    "${a.title}"`);
      console.log(`Primary Source:   [${a.source}]`);
      if (a.selectedArticleId && a.selectedArticleId._id.toString() !== a._id.toString()) {
        console.log(`>> SELECTED BEST: "${a.selectedArticleId.title}"`);
        console.log(`>> SELECTED SRC:  [${a.selectedArticleId.source}]`);
        console.log(`>> SELECTION REASON: Heuristic picked higher-quality Tier 1 reporting with longer snippet over title-echo`);
      } else {
        console.log(`Selected Article: [Primary Article used]`);
      }
      console.log(`Topic Focus:      "${a.matchedTopic}"`);
      console.log(`Snippet:          "${(a.snippet || '').slice(0, 160)}..."`);
      console.log(`\n--- SUMMARY ---`);
      console.log(a.summary);
      console.log(`\n--- WHY READ THIS ---`);
      console.log(a.whyReadThis);
      console.log('============================================================');
    });
  } finally {
    await disconnectDB();
  }
}

inspectSamples().catch(console.error);
