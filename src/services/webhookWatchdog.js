const config = require('../config');
const { captureMessage, captureException } = require('./sentry');

/**
 * Validates Telegram webhook health via Telegram Bot API getWebhookInfo.
 * Detects unregistered webhooks, mismatched URLs, recent delivery errors, or backed-up queues.
 *
 * @param {Object} [options]
 * @param {string} [options.expectedUrl]
 * @returns {Promise<{ healthy: boolean, reason: string|null, details: Object }>}
 */
async function checkTelegramWebhookHealth(options = {}) {
  if (!config.TELEGRAM_BOT_TOKEN) {
    return { healthy: false, reason: 'TELEGRAM_BOT_TOKEN is not configured', details: {} };
  }

  const defaultExpectedUrl = 'https://ai-news-backend-rmdj.onrender.com/api/telegram/webhook';
  const expectedUrl = options.expectedUrl || process.env.TELEGRAM_WEBHOOK_URL || defaultExpectedUrl;

  try {
    const res = await fetch(`https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/getWebhookInfo`);
    const data = await res.json();

    if (!res.ok || !data.ok) {
      const errMsg = `Telegram getWebhookInfo failed HTTP ${res.status}: ${data.description || res.statusText}`;
      console.error(`[Webhook Watchdog] ❌ ${errMsg}`);
      captureMessage(errMsg, 'error', { tags: { component: 'telegram_webhook_watchdog', alertType: 'api_error' } });
      return { healthy: false, reason: errMsg, details: data };
    }

    const info = data.result;

    // Check 1: Webhook URL must be present
    if (!info.url || String(info.url).trim() === '') {
      const errMsg = 'Telegram webhook is UNREGISTERED (URL is empty). Bot is not receiving updates!';
      console.error(`[Webhook Watchdog] ❌ ${errMsg}`);
      captureMessage(errMsg, 'error', { tags: { component: 'telegram_webhook_watchdog', alertType: 'unregistered' } });
      return { healthy: false, reason: errMsg, details: info };
    }

    // Check 2: Webhook URL should match expected endpoint
    if (!info.url.includes('/api/telegram/webhook')) {
      const errMsg = `Telegram webhook URL mismatch. Current: "${info.url}", Expected to contain "/api/telegram/webhook"`;
      console.error(`[Webhook Watchdog] ❌ ${errMsg}`);
      captureMessage(errMsg, 'error', { tags: { component: 'telegram_webhook_watchdog', alertType: 'url_mismatch' } });
      return { healthy: false, reason: errMsg, details: info };
    }

    // Check 3: Check for recent delivery errors (within the past 2 hours)
    if (info.last_error_date) {
      const nowSec = Math.floor(Date.now() / 1000);
      const errorAgeMinutes = Math.floor((nowSec - info.last_error_date) / 60);

      if (errorAgeMinutes < 120) {
        const errMsg = `Telegram reports recent webhook delivery error (${errorAgeMinutes}m ago): "${info.last_error_message}"`;
        console.warn(`[Webhook Watchdog] ⚠️ ${errMsg}`);
        captureMessage(errMsg, 'warning', {
          tags: { component: 'telegram_webhook_watchdog', alertType: 'recent_delivery_error' },
          extra: { lastErrorDate: new Date(info.last_error_date * 1000).toISOString(), lastErrorMessage: info.last_error_message },
        });
        return { healthy: false, reason: errMsg, details: info };
      }
    }

    // Check 4: Check if pending updates are piling up (> 25)
    if (info.pending_update_count > 25) {
      const errMsg = `Telegram webhook backlog warning: ${info.pending_update_count} pending updates.`;
      console.warn(`[Webhook Watchdog] ⚠️ ${errMsg}`);
      captureMessage(errMsg, 'warning', { tags: { component: 'telegram_webhook_watchdog', alertType: 'pending_backlog' } });
      return { healthy: false, reason: errMsg, details: info };
    }

    console.log(`[Webhook Watchdog] ✓ Telegram webhook healthy (${info.url}, pending: ${info.pending_update_count})`);
    return { healthy: true, reason: null, details: info };
  } catch (err) {
    const errMsg = `Failed to query Telegram webhook info: ${err.message}`;
    console.error(`[Webhook Watchdog] ❌ ${errMsg}`);
    captureException(err, { tags: { component: 'telegram_webhook_watchdog' } });
    return { healthy: false, reason: errMsg, details: {} };
  }
}

/**
 * Validates WhatsApp webhook & Cloud API health.
 * Checks Meta Graph API subscribed apps & token validity, and tests synthetic webhook handshake.
 *
 * @returns {Promise<{ healthy: boolean, reason: string|null, details: Object }>}
 */
async function checkWhatsAppWebhookHealth() {
  const issues = [];
  const details = {};

  // Check 1: Meta Cloud API Token & WABA Subscription
  if (config.WHATSAPP_ACCESS_TOKEN && config.WHATSAPP_BUSINESS_ACCOUNT_ID) {
    try {
      const wabaUrl = `https://graph.facebook.com/${config.WHATSAPP_API_VERSION || 'v20.0'}/${config.WHATSAPP_BUSINESS_ACCOUNT_ID}/subscribed_apps`;
      const res = await fetch(wabaUrl, {
        headers: { Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}` },
      });
      const data = await res.json();
      details.wabaSubscription = data;

      if (!res.ok || data.error) {
        const isAuthError = res.status === 401 || data.error?.code === 190;
        const msg = isAuthError
          ? `Meta WHATSAPP_ACCESS_TOKEN is EXPIRED or INVALID (HTTP ${res.status}: ${data.error?.message || 'Unauthorized'})`
          : `Meta WABA subscription check failed (HTTP ${res.status}: ${data.error?.message || res.statusText})`;
        issues.push(msg);
        captureMessage(msg, 'error', {
          tags: { component: 'whatsapp_webhook_watchdog', alertType: isAuthError ? 'token_expired' : 'waba_error' },
        });
      } else {
        const isSubscribed = Array.isArray(data.data) && data.data.length > 0;
        if (!isSubscribed) {
          const msg = 'Meta App is NOT subscribed to WhatsApp Business Account events!';
          issues.push(msg);
          captureMessage(msg, 'error', { tags: { component: 'whatsapp_webhook_watchdog', alertType: 'not_subscribed' } });
        }
      }
    } catch (err) {
      const msg = `Meta Graph API request error: ${err.message}`;
      issues.push(msg);
      captureException(err, { tags: { component: 'whatsapp_webhook_watchdog' } });
    }
  } else {
    issues.push('WHATSAPP_ACCESS_TOKEN or WHATSAPP_BUSINESS_ACCOUNT_ID is missing');
  }

  // Check 2: Synthetic Webhook Handshake (GET /api/whatsapp/webhook)
  const selfBaseUrl = process.env.RENDER_EXTERNAL_URL || config.BACKEND_URL;
  if (selfBaseUrl && config.WEBHOOK_VERIFY_TOKEN) {
    try {
      const challengeToken = `watchdog_${Date.now()}`;
      const probeUrl = `${selfBaseUrl}/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(
        config.WEBHOOK_VERIFY_TOKEN
      )}&hub.challenge=${challengeToken}`;

      const res = await fetch(probeUrl);
      const text = await res.text();
      details.handshakeStatus = res.status;

      if (res.status !== 200 || text !== challengeToken) {
        const msg = `Local WhatsApp webhook handshake failed (HTTP ${res.status}, response: "${text}")`;
        issues.push(msg);
        captureMessage(msg, 'error', { tags: { component: 'whatsapp_webhook_watchdog', alertType: 'handshake_failed' } });
      }
    } catch (err) {
      const msg = `Local WhatsApp webhook probe failed: ${err.message}`;
      issues.push(msg);
      captureException(err, { tags: { component: 'whatsapp_webhook_watchdog' } });
    }
  }

  const healthy = issues.length === 0;
  if (healthy) {
    console.log('[Webhook Watchdog] ✓ WhatsApp webhook & Meta subscription healthy');
  } else {
    console.error(`[Webhook Watchdog] ❌ WhatsApp webhook issues: ${issues.join('; ')}`);
  }

  return {
    healthy,
    reason: issues.length > 0 ? issues.join('; ') : null,
    details,
  };
}

/**
 * Runs full health check across both Telegram and WhatsApp delivery webhooks.
 *
 * @param {Object} [options]
 * @returns {Promise<{ healthy: boolean, telegram: Object, whatsapp: Object }>}
 */
async function checkAllDeliveryWebhooks(options = {}) {
  console.log('\n[Webhook Watchdog] 🔍 Running delivery channels webhook health self-check...');
  const [telegram, whatsapp] = await Promise.all([
    checkTelegramWebhookHealth(options),
    checkWhatsAppWebhookHealth(),
  ]);

  const healthy = telegram.healthy && whatsapp.healthy;
  console.log(`[Webhook Watchdog] Health check result: ${healthy ? 'ALL CHANNELS HEALTHY ✓' : 'DEGRADED / ISSUES FOUND ❌'}\n`);

  return {
    healthy,
    telegram,
    whatsapp,
    timestamp: new Date().toISOString(),
  };
}

module.exports = {
  checkTelegramWebhookHealth,
  checkWhatsAppWebhookHealth,
  checkAllDeliveryWebhooks,
};
