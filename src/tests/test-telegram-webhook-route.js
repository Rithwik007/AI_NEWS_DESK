require('dotenv').config();
const assert = require('assert');
const { createApp } = require('../api/app');
const config = require('../config');

async function runRouteTests() {
  console.log('\n=============================================');
  console.log('TEST SUITE: TELEGRAM WEBHOOK ROUTE & SECRET VALIDATION');
  console.log('=============================================\n');

  const app = createApp();
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api/telegram/webhook`;

  try {
    // Test 1: Webhook endpoint responds 200 without secret token when no secret is configured
    console.log('[Test 1] Testing POST /api/telegram/webhook without secret configured...');
    const origSecret = config.TELEGRAM_WEBHOOK_SECRET;
    config.TELEGRAM_WEBHOOK_SECRET = null;

    const res1 = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        update_id: 123456,
        message: {
          message_id: 1,
          chat: { id: 9999999999 },
          text: 'test_hello',
        },
      }),
    });

    assert.strictEqual(res1.status, 200);
    const data1 = await res1.json();
    assert.strictEqual(data1.ok, true);
    console.log('✓ Responded 200 OK immediately without secret.');

    // Test 2: When secret is configured, reject missing/invalid secret with 403
    console.log('\n[Test 2] Testing secret verification with invalid secret token...');
    config.TELEGRAM_WEBHOOK_SECRET = 'my_super_secret_token_123';

    const res2 = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-bot-api-secret-token': 'wrong_secret',
      },
      body: JSON.stringify({ update_id: 123457 }),
    });

    assert.strictEqual(res2.status, 403);
    const data2 = await res2.json();
    assert.strictEqual(data2.error, 'Forbidden');
    console.log('✓ Correctly rejected invalid secret with 403 Forbidden.');

    // Test 3: When secret is configured, accept valid secret with 200
    console.log('\n[Test 3] Testing secret verification with matching secret token...');
    const res3 = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-bot-api-secret-token': 'my_super_secret_token_123',
      },
      body: JSON.stringify({
        update_id: 123458,
        message: {
          message_id: 2,
          chat: { id: 9999999999 },
          text: 'test_with_secret',
        },
      }),
    });

    assert.strictEqual(res3.status, 200);
    const data3 = await res3.json();
    assert.strictEqual(data3.ok, true);
    console.log('✓ Valid secret accepted with 200 OK.');

    // Restore original config
    config.TELEGRAM_WEBHOOK_SECRET = origSecret;

    console.log('\n=============================================');
    console.log('ALL WEBHOOK ROUTE TESTS PASSED! ✓');
    console.log('=============================================\n');
  } finally {
    server.close();
  }
}

runRouteTests().catch((err) => {
  console.error('Webhook route test failed:', err);
  process.exit(1);
});
