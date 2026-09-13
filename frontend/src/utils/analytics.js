import posthog from 'posthog-js';

let isInitialized = false;

/**
 * Initialize PostHog lightweight analytics if VITE_POSTHOG_KEY is provided.
 */
export function initPostHog() {
  const apiKey = import.meta.env.VITE_POSTHOG_KEY;
  const apiHost = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';

  if (!apiKey) {
    console.log('[PostHog] No VITE_POSTHOG_KEY provided — analytics dormant.');
    return;
  }

  if (isInitialized) return;

  posthog.init(apiKey, {
    api_host: apiHost,
    person_profiles: 'identified_only',
    capture_pageview: false, // Explicit pageview tracking on route changes
    autocapture: false,      // Keep lightweight, no invasive DOM recording
  });

  isInitialized = true;
  console.log('[PostHog] Frontend analytics initialized successfully.');
}

/**
 * Explicitly capture a pageview event.
 *
 * @param {string} pagePath
 * @param {Object} [properties]
 */
export function trackPageView(pagePath, properties = {}) {
  if (!isInitialized) return;
  posthog.capture('$pageview', {
    $current_url: window.location.href,
    path: pagePath,
    ...properties,
  });
}

/**
 * Capture a custom product event (e.g. 'interests_saved', 'telegram_linked').
 *
 * @param {string} eventName
 * @param {Object} [properties]
 */
export function trackEvent(eventName, properties = {}) {
  if (!isInitialized) return;
  posthog.capture(eventName, properties);
}

/**
 * Identify authenticated Clerk user in PostHog.
 *
 * @param {string} userId
 * @param {Object} [traits]
 */
export function identifyUser(userId, traits = {}) {
  if (!isInitialized || !userId) return;
  posthog.identify(userId, traits);
}

/**
 * Reset PostHog identity on sign out.
 */
export function resetAnalytics() {
  if (!isInitialized) return;
  posthog.reset();
}

export { posthog };
