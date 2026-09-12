/**
 * Entry point for the AI News Delivery pipeline.
 *
 * Runs full pipeline: Fetch → Dedup → Relevance Filter → Summarize → Telegram Delivery.
 */
const { fetchAndDedup } = require('./pipeline/fetchAndDedup');

async function main() {
  const args = process.argv.slice(2);
  const runType = args.includes('--evening')
    ? 'evening'
    : (args.includes('--morning') ? 'morning' : process.env.RUN_TYPE || 'morning');

  console.log('[Main] Starting AI News Pipeline (Steps 1-4)');
  console.log(`[Main] Run Type: ${runType.toUpperCase()}`);
  console.log(`[Main] Time: ${new Date().toISOString()}\n`);

  try {
    await fetchAndDedup({ runType });
    console.log('[Main] Pipeline completed successfully');
  } catch (error) {
    console.error('[Main] Pipeline failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
