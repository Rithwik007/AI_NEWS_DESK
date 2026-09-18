const { startServer } = require('../server');
const { disconnectDB } = require('../db/connect');
const { registerBotCommands } = require('./registerBotCommands');

/**
 * Unified entrypoint: starts Express API server (with scheduler and webhooks)
 * and registers bot commands. Webhooks handle Telegram & WhatsApp incoming updates.
 */
async function main() {
  console.log('[System] Launching AI News Desk web service (Express + Schedulers + Webhooks)...');

  // Start Express API server (connects to DB and initializes scheduler)
  const { app, server } = await startServer();

  const handleShutdown = async (signal) => {
    console.log(`\n[System] Received ${signal}. Shutting down services...`);
    if (server) {
      server.close(() => console.log('[System] Express HTTP server closed.'));
    }
    await disconnectDB();
    process.exit(0);
  };

  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));

  // Register Telegram bot commands (/start, /digest) in the "/" menu
  await registerBotCommands();

  console.log('[System] Webhook service is active and listening for incoming updates.');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[System] Startup failed:', err);
    process.exit(1);
  });
}

module.exports = { main };
