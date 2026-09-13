const Sentry = require('@sentry/node');

let isInitialized = false;

/**
 * Initialize backend Sentry error tracking if SENTRY_DSN is present.
 */
function initSentry() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    console.log('[Sentry] No SENTRY_DSN provided — error tracking dormant.');
    return;
  }

  if (isInitialized) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'production',
    tracesSampleRate: 1.0,
  });

  isInitialized = true;
  console.log('[Sentry] Backend error tracking initialized successfully.');
}

/**
 * Captures an exception with optional structured tags and extra metadata.
 *
 * @param {Error|any} err
 * @param {Object} [context]
 * @param {Object} [context.tags]
 * @param {Object} [context.extra]
 */
function captureException(err, context = {}) {
  if (!isInitialized) return;
  Sentry.withScope((scope) => {
    if (context.tags) scope.setTags(context.tags);
    if (context.extra) scope.setExtras(context.extra);
    Sentry.captureException(err);
  });
}

/**
 * Captures a message with a given severity level and optional context.
 *
 * @param {string} message
 * @param {'fatal'|'error'|'warning'|'log'|'info'|'debug'} [level='info']
 * @param {Object} [context]
 */
function captureMessage(message, level = 'info', context = {}) {
  if (!isInitialized) return;
  Sentry.withScope((scope) => {
    if (context.tags) scope.setTags(context.tags);
    if (context.extra) scope.setExtras(context.extra);
    scope.setLevel(level);
    Sentry.captureMessage(message);
  });
}

/**
 * Registers Sentry's Express error-handling middleware.
 *
 * @param {import('express').Application} app
 */
function setupExpressErrorHandler(app) {
  if (isInitialized && typeof Sentry.setupExpressErrorHandler === 'function') {
    Sentry.setupExpressErrorHandler(app);
  }
}

module.exports = {
  initSentry,
  captureException,
  captureMessage,
  setupExpressErrorHandler,
  Sentry,
};
