const { createApp } = require('./api/app');
const { connectDB } = require('./db/connect');
const { initScheduler } = require('./services/scheduler');
const { initSentry } = require('./services/sentry');
const { validateStartupEnv } = require('./utils/validateEnv');
const config = require('./config');

async function startServer() {
  validateStartupEnv({ failFast: true });
  initSentry();
  await connectDB();
  initScheduler();
  const app = createApp();

  const port = config.PORT || 3000;
  const server = app.listen(port, () => {
    console.log(`[Server] API backend running on http://localhost:${port}`);
    console.log(`[Server] Health check available at http://localhost:${port}/api/health`);
  });

  return { app, server };
}

if (require.main === module) {
  startServer().catch((err) => {
    console.error('[Server] Failed to start:', err);
    process.exit(1);
  });
}

module.exports = { startServer };
