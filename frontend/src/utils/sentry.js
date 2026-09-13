import * as Sentry from '@sentry/react';

let isInitialized = false;

/**
 * Initialize frontend Sentry tracking if VITE_SENTRY_DSN is configured.
 */
export function initFrontendSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) {
    console.log('[Sentry] No VITE_SENTRY_DSN provided — frontend tracking dormant.');
    return;
  }

  if (isInitialized) return;

  Sentry.init({
    dsn,
    integrations: [
      Sentry.browserTracingIntegration(),
    ],
    tracesSampleRate: 1.0,
  });

  isInitialized = true;
  console.log('[Sentry] Frontend error tracking initialized successfully.');
}

export { Sentry };
