const { connectDB, disconnectDB } = require('../db/connect');
const { startTelegramPoller } = require('../services/telegramPoller');

async function main() {
  console.log('[Poller Script] Connecting to database...');
  await connectDB();

  const controller = new AbortController();

  process.on('SIGINT', async () => {
    console.log('\n[Poller Script] Received SIGINT. Shutting down...');
    controller.abort();
    await disconnectDB();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n[Poller Script] Received SIGTERM. Shutting down...');
    controller.abort();
    await disconnectDB();
    process.exit(0);
  });

  try {
    await startTelegramPoller({ signal: controller.signal });
  } catch (err) {
    console.error('[Poller Script] Fatal error:', err.message);
    await disconnectDB();
    process.exit(1);
  }
}

main();
