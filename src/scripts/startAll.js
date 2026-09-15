const { startServer } = require('../server');
const { startTelegramPoller } = require('../services/telegramPoller');
const { disconnectDB } = require('../db/connect');
const { registerBotCommands } = require('./registerBotCommands');

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

  // Register Telegram bot commands (/start, /digest) in the "/" menu
  await registerBotCommands();

  // Poller supervisor: auto-restart on crash/exit with exponential backoff.
  // Prevents the "poller silently dead while Express stays up" failure mode.
  const { captureException } = require('../services/sentry');
  let restartDelay = 2000; // Start 2s, cap at 60s
  while (!controller.signal.aborted) {
    try {
      console.log('[System] Starting Telegram poller...');
      await startTelegramPoller({ signal: controller.signal });
      // If poller exits cleanly (signal aborted), break out
      if (controller.signal.aborted) break;
      console.warn('[System] Poller exited unexpectedly without error. Restarting...');
    } catch (err) {
      if (controller.signal.aborted) break;
      console.error(`[System] Poller crashed: ${err.message}. Restarting in ${restartDelay / 1000}s...`);
      captureException(err, { tags: { component: 'poller_supervisor' } });
    }
    // Backoff before restart: 2s → 4s → 8s → ... → 60s
    await new Promise((r) => setTimeout(r, restartDelay));
    restartDelay = Math.min(restartDelay * 2, 60000);
  }
  console.log('[System] Poller supervisor stopped (shutdown signal received).');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[System] Startup failed:', err);
    process.exit(1);
  });
}

module.exports = { main };
