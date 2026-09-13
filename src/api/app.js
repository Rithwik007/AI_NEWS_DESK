const express = require('express');
const { clerkMiddleware } = require('@clerk/express');
const cors = require('cors');
const authRoutes = require('../routes/auth');
const interestsRoutes = require('../routes/interests');
const telegramRoutes = require('../routes/telegram');
const pipelineRoutes = require('../routes/pipeline');

/**
 * Creates and configures the Express API application.
 *
 * @returns {import('express').Express}
 */
function createApp() {
  const app = express();

  const allowedOrigins = [
    process.env.FRONTEND_URL,
    'http://localhost:5173',
    'http://localhost:3000',
  ].filter(Boolean);

  app.use(
    cors({
      origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (
          allowedOrigins.includes(origin) ||
          origin.endsWith('.vercel.app') ||
          origin.includes('localhost')
        ) {
          return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-pipeline-secret'],
    })
  );

  app.use(express.json());

  // Attach Clerk auth context to all requests (verifies session tokens if provided)
  app.use(clerkMiddleware());

  // Mount API route modules
  app.use('/api/auth', authRoutes);
  app.use('/api/interests', interestsRoutes);
  app.use('/api/telegram', telegramRoutes);
  app.use('/api/pipeline', pipelineRoutes);

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date() });
  });

  // Sentry debug test endpoint
  app.get('/api/debug/sentry-test', (req, res, next) => {
    const { captureMessage, captureException } = require('../services/sentry');
    captureMessage('[Sentry Test] Manual test message from /api/debug/sentry-test', 'warning');
    const err = new Error('Sentry Test Error — triggered via /api/debug/sentry-test');
    captureException(err, { tags: { test: true } });
    next(err);
  });

  // Serve production frontend build if available
  const path = require('path');
  const fs = require('fs');
  const distPath = path.join(__dirname, '../../frontend/dist');
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.use((req, res, next) => {
      if (req.method === 'GET' && !req.path.startsWith('/api')) {
        return res.sendFile(path.join(distPath, 'index.html'));
      }
      next();
    });
  }

  // Sentry Express error-handling middleware
  const { setupExpressErrorHandler } = require('../services/sentry');
  setupExpressErrorHandler(app);

  return app;
}

module.exports = { createApp };
