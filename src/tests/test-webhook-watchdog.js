require('dotenv').config();
const assert = require('assert');
const config = require('../config');
const {
  checkTelegramWebhookHealth,
  checkWhatsAppWebhookHealth,
  checkAllDeliveryWebhooks,
} = require('../services/webhookWatchdog');

const PRODUCTION_WEBHOOK_URL = 'https://ai-news-backend-rmdj.onrender.com/api/telegram/webhook';
const BROKEN_TEST_WEBHOOK_URL = 'https://wrong-broken-host.example.com/api/telegram/webhook';

async function setTelegramWebhookDirect(url) {
  const baseUrl = `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}`;
  const body = {
    url,
    allowed_updates: ['message'],
  };
  if (config.TELEGRAM_WEBHOOK_SECRET) {
    body.secret_token = config.TELEGRAM_WEBHOOK_SECRET;
  }
  const res = await fetch(`${baseUrl}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function runWatchdogTests() {
  console.log('\n======================================================');
  console.log('TEST SUITE: DELIVERY CHANNELS WEBHOOK RELIABILITY WATCHDOG');
  console.log('======================================================\n');

  // Ensure production webhook is set initially
  console.log('[Setup] Ensuring production webhook is active...');
  await setTelegramWebhookDirect(PRODUCTION_WEBHOOK_URL);

  // Test 1: Check initial healthy state
  console.log('\n[Test 1] Testing healthy Telegram webhook state...');
  const initialCheck = await checkTelegramWebhookHealth();
  console.log('Initial Telegram health:', initialCheck);
  assert.strictEqual(initialCheck.healthy, true, 'Telegram webhook should be initially healthy');
  assert.ok(initialCheck.details.url.includes('/api/telegram/webhook'));
  console.log('✓ Test 1 passed: Current live webhook verified healthy.');

  // Test 2: Deliberately break Telegram webhook registration (deleteWebhook -> empty URL) & verify watchdog catches it
  console.log('\n[Test 2] Deliberately de-registering Telegram webhook (simulating dropped webhook)...');
  const baseUrl = `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}`;
  const delRes = await fetch(`${baseUrl}/deleteWebhook`);
  const delData = await delRes.json();
  assert.strictEqual(delData.ok, true, 'Telegram deleteWebhook succeeded');
  console.log('Telegram webhook deleted (url is now empty).');

  console.log('Running watchdog check on de-registered state...');
  const brokenCheck = await checkTelegramWebhookHealth();
  console.log('De-registered state watchdog result:', brokenCheck);
  assert.strictEqual(brokenCheck.healthy, false, 'Watchdog MUST flag de-registered webhook as unhealthy');
  assert.ok(brokenCheck.reason.includes('UNREGISTERED'), 'Watchdog reason must flag UNREGISTERED');
  console.log('✓ Test 2 passed: Watchdog successfully caught de-registered webhook and flagged alert!');

  // Test 2b: Test mismatched route
  console.log('\n[Test 2b] Deliberately pointing Telegram webhook to wrong endpoint (/api/health)...');
  const wrongRouteRes = await setTelegramWebhookDirect('https://ai-news-backend-rmdj.onrender.com/api/health');
  assert.strictEqual(wrongRouteRes.ok, true, 'Telegram setWebhook to /api/health succeeded');
  const mismatchCheck = await checkTelegramWebhookHealth();
  console.log('Mismatched route watchdog result:', mismatchCheck);
  assert.strictEqual(mismatchCheck.healthy, false, 'Watchdog MUST flag route mismatch as unhealthy');
  assert.ok(mismatchCheck.reason.includes('URL mismatch'), 'Watchdog reason must flag URL mismatch');
  console.log('✓ Test 2b passed: Watchdog successfully caught mismatched URL!');

  // Test 3: Restore correct production webhook & verify watchdog reports healthy
  console.log('\n[Test 3] Restoring production webhook URL in Telegram API...');
  await new Promise((r) => setTimeout(r, 1500)); // Brief pause to avoid Telegram rate limits
  let restoreRes = await setTelegramWebhookDirect(PRODUCTION_WEBHOOK_URL);
  if (!restoreRes.ok && restoreRes.parameters?.retry_after) {
    const waitMs = (restoreRes.parameters.retry_after + 1) * 1000;
    console.log(`Telegram rate limit: waiting ${waitMs}ms before retrying setWebhook...`);
    await new Promise((r) => setTimeout(r, waitMs));
    restoreRes = await setTelegramWebhookDirect(PRODUCTION_WEBHOOK_URL);
  }
  console.log('Restore response:', restoreRes);
  assert.strictEqual(restoreRes.ok, true, 'Telegram setWebhook restore succeeded');
  console.log(`Telegram webhook restored to: ${PRODUCTION_WEBHOOK_URL}`);

  console.log('Running watchdog check on restored state...');
  const restoredCheck = await checkTelegramWebhookHealth();
  console.log('Restored state watchdog result:', restoredCheck);
  assert.strictEqual(restoredCheck.healthy, true, 'Watchdog MUST report healthy after restoration');
  assert.strictEqual(restoredCheck.details.url, PRODUCTION_WEBHOOK_URL);
  console.log('✓ Test 3 passed: Watchdog verified restored webhook health.');

  // Test 4: WhatsApp subscription & token verification
  console.log('\n[Test 4] Testing WhatsApp Meta Graph API subscription check...');
  const waCheck = await checkWhatsAppWebhookHealth();
  console.log('WhatsApp health result:', waCheck);
  assert.strictEqual(waCheck.healthy, true, 'WhatsApp webhook & WABA subscription should be healthy');
  console.log('✓ Test 4 passed: Meta WABA subscription & token valid.');

  // Test 5: Full combined check
  console.log('\n[Test 5] Running combined checkAllDeliveryWebhooks...');
  const allCheck = await checkAllDeliveryWebhooks();
  assert.strictEqual(allCheck.healthy, true, 'Overall delivery channels health should be true');
  console.log('✓ Test 5 passed: All delivery channels verified healthy.');

  console.log('\n======================================================');
  console.log('ALL WEBHOOK RELIABILITY WATCHDOG TESTS PASSED! ✓');
  console.log('======================================================\n');
}

runWatchdogTests().catch((err) => {
  console.error('Watchdog test failed:', err);
  // Ensure we restore webhook even if an assertion failed
  setTelegramWebhookDirect(PRODUCTION_WEBHOOK_URL).finally(() => {
    process.exit(1);
  });
});
