const { connectDB, disconnectDB } = require('../db/connect');
const { summarizeRelevantClusters } = require('../services/summarize');

async function main() {
  await connectDB();

  try {
    const result = await summarizeRelevantClusters();
    console.log('\nSample outputs to inspect:');
    result.sampleOutputs.slice(0, 5).forEach((sample, idx) => {
      console.log(`\n------------------------------------------------------------`);
      console.log(`SAMPLE #${idx + 1}:`);
      console.log(`Title:       "${sample.title}"`);
      console.log(`Source:      [${sample.source}]`);
      console.log(`Topic:       "${sample.matchedTopic}"`);
      console.log(`Selected != Primary: ${sample.isDifferentFromPrimary}`);
      console.log(`Summary:     "${sample.summary}"`);
      console.log(`WhyReadThis: "${sample.whyReadThis}"`);
    });
  } finally {
    await disconnectDB();
  }
}

main().catch(console.error);
