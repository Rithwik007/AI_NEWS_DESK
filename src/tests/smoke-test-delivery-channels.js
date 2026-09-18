require('dotenv').config();
const assert = require('assert');
const { createApp } = require('../api/app');
const { connectDB, disconnectDB } = require('../db/connect');
const User = require('../models/User');

async function smokeTestChannels() {
  console.log('\n=============================================');
  console.log('SMOKE TEST: DELIVERY CHANNELS FLOWS');
  console.log('=============================================\n');

  await connectDB();
  const app = createApp();
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  const testUserId = 'user_smoke_channels_01';

  try {
    // Setup test user
    await User.deleteMany({ clerkUserId: testUserId });
    await User.create({
      clerkUserId: testUserId,
      email: 'channels_test@example.com',
      telegramChatId: null,
      whatsappPhoneNumber: null,
      isWhatsAppEligible: false,
    });

    // Mock Clerk auth token in headers for dev testing or bypass
    // Let's test direct functions that backend routes use:
    const { generateTelegramLinkCode } = require('../services/telegramAuth');
    const { isPhoneAllowed } = require('../services/whatsapp');

    // 1. Telegram code generation
    console.log('[Test 1] Testing Telegram linking code generation...');
    const linkCodeData = await generateTelegramLinkCode(testUserId);
    assert.ok(linkCodeData.code);
    assert.strictEqual(linkCodeData.code.length, 6);
    console.log(`✓ Telegram code generated: ${linkCodeData.code}`);

    // 2. WhatsApp registration & eligibility
    console.log('\n[Test 2] Testing WhatsApp number registration & eligibility check...');
    const testEligiblePhone = '+917013560134';
    const isEligible = isPhoneAllowed(testEligiblePhone);
    const updated = await User.findOneAndUpdate(
      { clerkUserId: testUserId },
      { $set: { whatsappPhoneNumber: testEligiblePhone, isWhatsAppEligible: isEligible } },
      { new: true }
    );
    assert.strictEqual(updated.whatsappPhoneNumber, testEligiblePhone);
    assert.strictEqual(updated.isWhatsAppEligible, true);
    console.log(`✓ WhatsApp registered: ${updated.whatsappPhoneNumber}, eligible: ${updated.isWhatsAppEligible}`);

    console.log('\n=============================================');
    console.log('ALL DELIVERY CHANNELS SMOKE TESTS PASSED! ✓');
    console.log('=============================================\n');
  } finally {
    server.close();
    await User.deleteMany({ clerkUserId: testUserId });
    await disconnectDB();
  }
}

smokeTestChannels().catch(err => {
  console.error('Smoke test failed:', err);
  process.exit(1);
});
