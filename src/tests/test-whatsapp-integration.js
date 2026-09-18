const assert = require('assert');
const http = require('http');
const config = require('../config');
const { createApp } = require('../api/app');
const {
  cleanPhoneNumber,
  formatWhatsAppArticleEntry,
  chunkWhatsAppText,
} = require('../services/whatsapp');

async function runTests() {
  console.log('\n=============================================');
  console.log('TEST SUITE: WHATSAPP INTEGRATION & WEBHOOK');
  console.log('=============================================\n');

  // Test 1: Helper functions
  console.log('[Test 1] Testing cleanPhoneNumber...');
  assert.strictEqual(cleanPhoneNumber('+91 98765-43210'), '919876543210');
  assert.strictEqual(cleanPhoneNumber('1 (555) 234-5678'), '15552345678');
  assert.strictEqual(cleanPhoneNumber(''), '');
  console.log('✓ cleanPhoneNumber passed.');

  console.log('\n[Test 2] Testing formatWhatsAppArticleEntry...');
  const mockArticle = {
    title: 'OpenAI Releases New Model',
    url: 'https://openai.com/blog/new-model',
    source: 'OpenAI Blog',
    summary: 'A breakthrough in reasoning capabilities.',
    whyReadThis: 'Shifts benchmark performance across mathematics and logic.',
  };
  const formatted = formatWhatsAppArticleEntry(mockArticle, 1);
  assert.ok(formatted.includes('*1. OpenAI Releases New Model*'));
  assert.ok(formatted.includes('🔗 https://openai.com/blog/new-model'));
  assert.ok(formatted.includes('💡 *Why read this:*'));
  console.log('✓ formatWhatsAppArticleEntry passed.');

  console.log('\n[Test 3] Testing chunkWhatsAppText...');
  const shortText = 'Short message';
  assert.deepStrictEqual(chunkWhatsAppText(shortText, 100), ['Short message']);
  const longText = Array(20).fill('This is a test line for chunking.').join('\n');
  const chunks = chunkWhatsAppText(longText, 100);
  assert.ok(chunks.length > 1);
  console.log(`✓ chunkWhatsAppText produced ${chunks.length} chunks.`);

  // Test 4: Webhook Verification Handshake (GET /api/whatsapp/webhook)
  console.log('\n[Test 4] Testing GET /api/whatsapp/webhook verification handshake...');
  const app = createApp();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 4a. Valid verify token
    const testChallenge = 'challenge_code_123456';
    const verifyToken = config.WEBHOOK_VERIFY_TOKEN || 'test_verify_token';
    // Temporarily ensure verify token is set for test
    const origToken = config.WEBHOOK_VERIFY_TOKEN;
    config.WEBHOOK_VERIFY_TOKEN = verifyToken;

    const validUrl = `${baseUrl}/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(verifyToken)}&hub.challenge=${encodeURIComponent(testChallenge)}`;
    const validRes = await fetch(validUrl);
    const validText = await validRes.text();

    assert.strictEqual(validRes.status, 200, `Expected 200, got ${validRes.status}`);
    assert.strictEqual(validText, testChallenge, `Expected challenge "${testChallenge}", got "${validText}"`);
    console.log('✓ Valid handshake returned 200 with challenge string.');

    // 4b. Invalid verify token
    const invalidUrl = `${baseUrl}/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=${encodeURIComponent(testChallenge)}`;
    const invalidRes = await fetch(invalidUrl);
    assert.strictEqual(invalidRes.status, 403, `Expected 403 Forbidden, got ${invalidRes.status}`);
    console.log('✓ Invalid handshake rejected with 403 Forbidden.');

    // 4c. POST /api/whatsapp/webhook receives event
    console.log('\n[Test 5] Testing POST /api/whatsapp/webhook event acceptance...');
    const postRes = await fetch(`${baseUrl}/api/whatsapp/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'WHATSAPP_BUSINESS_ACCOUNT_ID',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: { display_phone_number: '1234567890', phone_number_id: '1325918710601819' },
                  messages: [
                    {
                      from: '919876543210',
                      id: 'wamid.test',
                      timestamp: String(Math.floor(Date.now() / 1000)),
                      type: 'text',
                      text: { body: 'hello bot' },
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      }),
    });

    const postBody = await postRes.text();
    assert.strictEqual(postRes.status, 200);
    assert.strictEqual(postBody, 'EVENT_RECEIVED');
    console.log('✓ Webhook POST acknowledged immediately with 200 EVENT_RECEIVED.');

    config.WEBHOOK_VERIFY_TOKEN = origToken;
  } finally {
    server.close();
  }

  console.log('\n=============================================');
  console.log('ALL WHATSAPP TESTS PASSED SUCCESSFULLY! ✓');
  console.log('=============================================\n');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
