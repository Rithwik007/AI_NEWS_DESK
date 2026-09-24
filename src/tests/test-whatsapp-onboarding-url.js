require('dotenv').config();
const assert = require('assert');
const config = require('../config');
const whatsappService = require('../services/whatsapp');
const { createApp } = require('../api/app');

async function testOnboardingUrl() {
  console.log('Testing WhatsApp unregistered sender onboarding URL...');

  // 1. Verify config.FRONTEND_URL exists and is correct
  assert.strictEqual(
    config.FRONTEND_URL,
    'https://ai-news-desk-ecru.vercel.app',
    'config.FRONTEND_URL must default to https://ai-news-desk-ecru.vercel.app'
  );

  // 2. Mock sendWhatsAppMessage to capture message text
  let capturedRecipient = null;
  let capturedText = null;
  const originalSend = whatsappService.sendWhatsAppMessage;
  whatsappService.sendWhatsAppMessage = async (to, text) => {
    capturedRecipient = to;
    capturedText = text;
    return { success: true };
  };

  const app = createApp();
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const fakeUnregisteredPhone = '999888777666';
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'test_waba_id',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: { display_phone_number: '12345', phone_number_id: '12345' },
                messages: [
                  {
                    from: fakeUnregisteredPhone,
                    id: 'wamid.test',
                    timestamp: '1699999999',
                    type: 'text',
                    text: { body: 'Hello' },
                  },
                ],
              },
              field: 'messages',
            },
          ],
        },
      ],
    };

    const res = await fetch(`http://localhost:${port}/api/whatsapp/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    assert.strictEqual(res.status, 200, 'Webhook should respond 200 immediately');

    // Wait a brief tick for async webhook handler to call sendWhatsAppMessage
    await new Promise((r) => setTimeout(r, 500));

    console.log('Captured recipient:', capturedRecipient);
    console.log('Captured text:\n', capturedText);

    assert.strictEqual(capturedRecipient, fakeUnregisteredPhone);
    assert.ok(capturedText.includes(config.FRONTEND_URL), 'Message must contain config.FRONTEND_URL');
    assert.ok(!capturedText.includes('ai-news-desk-alpha.vercel.app'), 'Message must NOT contain old alpha URL');
    assert.ok(capturedText.includes('https://ai-news-desk-ecru.vercel.app'), 'Message must contain ecru Vercel URL');

    console.log('\n✓ Test Passed: WhatsApp onboarding message contains correct centralized frontend URL!');
  } finally {
    whatsappService.sendWhatsAppMessage = originalSend;
    server.close();
  }
}

testOnboardingUrl()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
  });
