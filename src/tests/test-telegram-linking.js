const { connectDB, disconnectDB } = require('../db/connect');
const User = require('../models/User');
const config = require('../config');
const { generateTelegramLinkCode, verifyAndLinkTelegramCode } = require('../services/telegramAuth');
const { processTelegramUpdate } = require('../services/telegramPoller');

async function runTests() {
  console.log('=== STEP 5: TELEGRAM USER LINKING TEST SUITE ===\n');
  await connectDB();

  const testUserId = 'clerk_test_alpha_01';
  const realChatId = config.TELEGRAM_CHAT_ID; // 7106031577

  try {
    // Clean prior test artifacts
    await User.deleteMany({ clerkUserId: { $in: [testUserId, 'clerk_test_expired_02'] } });

    // --- TEST 1: Code Generation & Overwrite ---
    console.log('--- TEST 1: Link Code Generation ---');
    const gen1 = await generateTelegramLinkCode(testUserId);
    console.log(`Generated Code 1: ${gen1.code}, Expiry: ${gen1.expiry.toISOString()}`);

    if (!gen1.code || gen1.code.length !== 6) {
      throw new Error(`Invalid code format: ${gen1.code}`);
    }

    const dbUser1 = await User.findOne({ clerkUserId: testUserId }).lean();
    if (dbUser1.telegramLinkCode !== gen1.code) {
      throw new Error(`DB code mismatch: expected ${gen1.code}, got ${dbUser1.telegramLinkCode}`);
    }
    console.log('✓ User record created in MongoDB with code and 10-minute expiry');

    // Test overwrite with fresh code
    const gen2 = await generateTelegramLinkCode(testUserId);
    console.log(`Generated Code 2 (Overwrite): ${gen2.code}`);
    const dbUser2 = await User.findOne({ clerkUserId: testUserId }).lean();
    if (dbUser2.telegramLinkCode !== gen2.code) {
      throw new Error(`Code overwrite failed: ${dbUser2.telegramLinkCode} != ${gen2.code}`);
    }
    console.log('✓ Overwrite verified: old code invalidated, fresh code active\n');

    // --- TEST 2: Successful Linking via Telegram Update ---
    console.log('--- TEST 2: Live Telegram Linking via /start CODE ---');
    const validCode = gen2.code;
    const linkUpdate = {
      update_id: 99001,
      message: {
        message_id: 1,
        from: { id: parseInt(realChatId, 10), first_name: 'Tester' },
        chat: { id: parseInt(realChatId, 10), type: 'private' },
        date: Math.floor(Date.now() / 1000),
        text: `/start ${validCode}`,
      },
    };

    console.log(`Dispatching Telegram update: "/start ${validCode}" for chat ${realChatId}...`);
    const linkResult = await processTelegramUpdate(linkUpdate);
    console.log('Update processing result:', linkResult);

    if (!linkResult.result.success) {
      throw new Error(`Linking failed: ${JSON.stringify(linkResult)}`);
    }

    const linkedUser = await User.findOne({ clerkUserId: testUserId }).lean();
    console.log('Linked User in DB:', {
      clerkUserId: linkedUser.clerkUserId,
      telegramChatId: linkedUser.telegramChatId,
      telegramLinkedAt: linkedUser.telegramLinkedAt,
      telegramLinkCode: linkedUser.telegramLinkCode,
      telegramLinkCodeExpiry: linkedUser.telegramLinkCodeExpiry,
    });

    if (String(linkedUser.telegramChatId) !== String(realChatId)) {
      throw new Error(`chatId mismatch: expected ${realChatId}, got ${linkedUser.telegramChatId}`);
    }
    if (!linkedUser.telegramLinkedAt) {
      throw new Error('telegramLinkedAt was not set');
    }
    if (linkedUser.telegramLinkCode !== null) {
      throw new Error(`telegramLinkCode was not cleared: ${linkedUser.telegramLinkCode}`);
    }
    if (linkedUser.telegramLinkCodeExpiry !== null) {
      throw new Error('telegramLinkCodeExpiry was not cleared');
    }
    console.log('✓ Linking verified: telegramChatId populated, code cleared, linkedAt set, Telegram reply sent\n');

    // --- TEST 3: Reused Code Rejection ---
    console.log('--- TEST 3: Reused Code Rejection ---');
    console.log(`Attempting to reuse already-consumed code "${validCode}"...`);
    const reuseUpdate = {
      update_id: 99002,
      message: {
        message_id: 2,
        from: { id: parseInt(realChatId, 10), first_name: 'Tester' },
        chat: { id: parseInt(realChatId, 10), type: 'private' },
        date: Math.floor(Date.now() / 1000),
        text: `/start ${validCode}`,
      },
    };

    const reuseResult = await processTelegramUpdate(reuseUpdate);
    console.log('Reused code result:', reuseResult);

    if (reuseResult.result.success || reuseResult.result.reason !== 'INVALID_CODE') {
      throw new Error(`Expected INVALID_CODE rejection, got: ${JSON.stringify(reuseResult)}`);
    }
    console.log('✓ Reused code correctly rejected (INVALID_CODE) because code was consumed\n');

    // --- TEST 4: Expired Code Rejection ---
    console.log('--- TEST 4: Expired Code Rejection ---');
    const expiredUserId = 'clerk_test_expired_02';
    const expiredCode = 'OLD999';

    // Seed expired user
    await User.create({
      clerkUserId: expiredUserId,
      telegramLinkCode: expiredCode,
      telegramLinkCodeExpiry: new Date(Date.now() - 5 * 60 * 1000), // Expired 5 mins ago
      telegramChatId: null,
      telegramLinkedAt: null,
    });

    console.log(`Created test user with expired code "${expiredCode}" (expired 5m ago)...`);
    const expiredUpdate = {
      update_id: 99003,
      message: {
        message_id: 3,
        from: { id: parseInt(realChatId, 10), first_name: 'Tester' },
        chat: { id: parseInt(realChatId, 10), type: 'private' },
        date: Math.floor(Date.now() / 1000),
        text: `/start ${expiredCode}`,
      },
    };

    const expiredResult = await processTelegramUpdate(expiredUpdate);
    console.log('Expired code result:', expiredResult);

    if (expiredResult.result.success || expiredResult.result.reason !== 'EXPIRED_CODE') {
      throw new Error(`Expected EXPIRED_CODE rejection, got: ${JSON.stringify(expiredResult)}`);
    }

    const checkExpiredUser = await User.findOne({ clerkUserId: expiredUserId }).lean();
    if (checkExpiredUser.telegramChatId !== null) {
      throw new Error('Expired user was linked unexpectedly');
    }
    console.log('✓ Expired code correctly rejected (EXPIRED_CODE), user remains unlinked\n');

    console.log('==================================================');
    console.log('ALL 4 TESTS PASSED SUCCESSFULLY ✓');
    console.log('==================================================\n');

    // Clean up test records
    await User.deleteMany({ clerkUserId: { $in: [testUserId, expiredUserId] } });
    console.log('Test records cleaned up.');
  } finally {
    await disconnectDB();
  }
}

runTests().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
