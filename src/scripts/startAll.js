const { startServer } = require('../server');
const { startTelegramPoller } = require('../services/telegramPoller');
const { disconnectDB } = require('../db/connect');

/**
 * Unified entrypoint: starts Express API server + persistent Telegram poller
 * in a single Node process. Ideal for single-instance free tier deployment on Render.
 */
async function main() {
  console.log('[System] Launching unified web + poller service...');

  // Start Express API server (connects to DB and initializes scheduler)
  const { app, server } = await startServer();

  const controller = new AbortController();

  const handleShutdown = async (signal) => {
    console.log(`\n[System] Received ${signal}. Shutting down services...`);
    controller.abort();
    if (server) {
      server.close(() => console.log('[System] Express HTTP server closed.'));
    }
    await disconnectDB();
    process.exit(0);
  };

  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));

  // Start persistent Telegram long poller
  try {
    await startTelegramPoller({ signal: controller.signal });
  } catch (err) {
    console.error('[System] Poller error:', err.message);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[System] Startup failed:', err);
    process.exit(1);
  });
}

module.exports = { main };
