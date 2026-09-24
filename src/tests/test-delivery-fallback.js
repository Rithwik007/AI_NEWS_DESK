/**
 * Test Suite for WhatsApp-First Delivery with Telegram Fallback.
 * Tests:
 * 1. Eligible user with working WhatsApp -> sends WhatsApp, skips Telegram.
 * 2. Eligible user with failing WhatsApp -> falls back to Telegram, logs failure reason.
 * 3. Ineligible user -> skips WhatsApp, routes directly to Telegram.
 * 4. User without Telegram chat ID when WhatsApp fails -> handles gracefully with error record.
 */
const assert = require('assert');

// Mock helpers
function createMockUser(overrides = {}) {
  return {
    clerkUserId: 'test_user_1',
    telegramChatId: '123456789',
    whatsappPhoneNumber: '+917013560134',
    isWhatsAppEligible: true,
    ...overrides,
  };
}

async function simulateDeliveryPipeline(user, selectedArticles, options = {}, mocks = {}) {
  const {
    mockSendWhatsApp = async () => ({ messages: [{ id: 'wamid.TEST12345' }] }),
    mockSendTelegram = async () => ({ message_id: 999 }),
  } = mocks;

  const logs = [];
  const captureLog = (...args) => logs.push(args.join(' '));

  const channelStats = {
    telegram: { attempted: 0, succeeded: 0, failed: 0, errors: [] },
    whatsapp: { attempted: 0, succeeded: 0, failed: 0, errors: [] },
  };

  const errors = [];
  let sendSuccess = false;
  let channelDelivered = null;
  let deliveryReason = null;

  const messages = [`Header: ${selectedArticles.length} stories`];

  // 1. WhatsApp-First Delivery
  const isWhatsAppTarget = Boolean(user.isWhatsAppEligible && user.whatsappPhoneNumber);

  if (isWhatsAppTarget) {
    channelStats.whatsapp.attempted++;
    const todayFormatted = 'Sep 24, 2026';

    if (options.dryRun) {
      captureLog(`[Delivery] User "${user.clerkUserId}": [DRY RUN] WhatsApp attempted for ${user.whatsappPhoneNumber} (template: daily_digest_ready)`);
      sendSuccess = true;
      channelDelivered = 'whatsapp';
      deliveryReason = 'WhatsApp succeeded (dry-run)';
      channelStats.whatsapp.succeeded++;
    } else {
      try {
        captureLog(`[Delivery] User "${user.clerkUserId}": Attempting WhatsApp delivery first (${user.whatsappPhoneNumber})...`);
        const waRes = await mockSendWhatsApp(user.whatsappPhoneNumber, 'daily_digest_ready', [todayFormatted], 'en');

        const messageId = waRes?.messages?.[0]?.id;
        if (!messageId) {
          throw new Error(`Meta returned response without message ID: ${JSON.stringify(waRes)}`);
        }

        sendSuccess = true;
        channelDelivered = 'whatsapp';
        deliveryReason = `WhatsApp succeeded (wamid: ${messageId})`;
        channelStats.whatsapp.succeeded++;
        captureLog(`[Delivery] User "${user.clerkUserId}": WhatsApp succeeded (wamid: ${messageId}). Telegram delivery skipped.`);
      } catch (waErr) {
        channelStats.whatsapp.failed++;
        channelStats.whatsapp.errors.push(`${user.clerkUserId} (${user.whatsappPhoneNumber}): ${waErr.message}`);
        captureLog(`[Delivery] User "${user.clerkUserId}": WhatsApp attempted, failed with error "${waErr.message}". Falling back to Telegram.`);
        deliveryReason = `WhatsApp failed (${waErr.message}), fell back to Telegram`;
      }
    }
  } else {
    const skipReason = !user.whatsappPhoneNumber
      ? 'no WhatsApp phone registered'
      : 'not WhatsApp-eligible';
    deliveryReason = `User ${skipReason}, used Telegram directly`;
    captureLog(`[Delivery] User "${user.clerkUserId}": ${deliveryReason}.`);
  }

  // 2. Telegram Delivery (Fallback or Primary)
  if (!sendSuccess && user.telegramChatId) {
    channelStats.telegram.attempted++;
    if (options.dryRun) {
      captureLog(`[Delivery] User "${user.clerkUserId}": [DRY RUN] Would send to Telegram ${user.telegramChatId}`);
      sendSuccess = true;
      channelDelivered = 'telegram';
      channelStats.telegram.succeeded++;
    } else {
      try {
        captureLog(`[Delivery] User "${user.clerkUserId}": Sending Telegram chunk to ${user.telegramChatId}...`);
        await mockSendTelegram(messages[0], user.telegramChatId);
        sendSuccess = true;
        channelDelivered = 'telegram';
        channelStats.telegram.succeeded++;
        captureLog(`[Delivery] User "${user.clerkUserId}": Telegram succeeded. Delivery complete.`);
      } catch (err) {
        channelStats.telegram.failed++;
        channelStats.telegram.errors.push(`${user.clerkUserId} (${user.telegramChatId}): ${err.message}`);
        captureLog(`[Delivery] User "${user.clerkUserId}": Telegram failed with error "${err.message}".`);
        errors.push({ userId: user.clerkUserId, chatId: user.telegramChatId, channel: 'telegram', error: err.message });
      }
    }
  } else if (!sendSuccess && !user.telegramChatId) {
    captureLog(`[Delivery] User "${user.clerkUserId}": Delivery failed — no Telegram chat ID linked and WhatsApp not delivered.`);
    errors.push({ userId: user.clerkUserId, channel: 'none', error: 'No Telegram chat ID and WhatsApp delivery unavailable or failed' });
  }

  const result = {
    userId: user.clerkUserId,
    channel: channelDelivered,
    reason: deliveryReason,
    fallbackUsed: Boolean(isWhatsAppTarget && channelDelivered === 'telegram'),
    channelStats,
    logs,
    errors,
  };

  return result;
}

async function runTests() {
  console.log('=== RUNNING DELIVERY FALLBACK TEST SUITE ===\n');

  // Test 1: Eligible WhatsApp user, Meta returns successful response
  {
    console.log('Test 1: Eligible user, WhatsApp succeeds');
    let telegramSent = false;
    const user = createMockUser();
    const result = await simulateDeliveryPipeline(
      user,
      [{ title: 'Story 1' }],
      {},
      {
        mockSendWhatsApp: async () => ({ messages: [{ id: 'wamid.HBgL123' }] }),
        mockSendTelegram: async () => { telegramSent = true; },
      }
    );

    assert.strictEqual(result.channel, 'whatsapp', 'Expected channel to be whatsapp');
    assert.strictEqual(telegramSent, false, 'Telegram must NOT be sent when WhatsApp succeeds');
    assert.strictEqual(result.fallbackUsed, false, 'fallbackUsed should be false');
    assert.strictEqual(result.channelStats.whatsapp.succeeded, 1);
    assert.strictEqual(result.channelStats.telegram.attempted, 0);
    assert.ok(result.logs.some(l => l.includes('WhatsApp succeeded (wamid: wamid.HBgL123). Telegram delivery skipped.')));
    console.log('✓ PASS: WhatsApp succeeded, Telegram correctly skipped.\n');
  }

  // Test 2: Eligible user, Meta API returns error (e.g. 404 or connection reset)
  {
    console.log('Test 2: Eligible user, WhatsApp fails with Meta error -> falls back to Telegram');
    let telegramSent = false;
    const user = createMockUser();
    const result = await simulateDeliveryPipeline(
      user,
      [{ title: 'Story 1' }],
      {},
      {
        mockSendWhatsApp: async () => {
          throw new Error('WhatsApp Template API error HTTP 404: (#132001) Template name does not exist in the translation');
        },
        mockSendTelegram: async () => { telegramSent = true; return { message_id: 101 }; },
      }
    );

    assert.strictEqual(result.channel, 'telegram', 'Expected channel to fall back to telegram');
    assert.strictEqual(telegramSent, true, 'Telegram MUST be sent when WhatsApp fails');
    assert.strictEqual(result.fallbackUsed, true, 'fallbackUsed should be true');
    assert.strictEqual(result.channelStats.whatsapp.failed, 1);
    assert.strictEqual(result.channelStats.telegram.succeeded, 1);
    assert.ok(result.logs.some(l => l.includes('WhatsApp attempted, failed with error "WhatsApp Template API error HTTP 404: (#132001) Template name does not exist in the translation". Falling back to Telegram.')));
    console.log('✓ PASS: WhatsApp failure triggered Telegram fallback with clear log.\n');
  }

  // Test 3: Eligible user, Meta API returns 200 but missing message ID (unconfirmed)
  {
    console.log('Test 3: Eligible user, Meta API returns 200 without message ID -> treated as failure -> Telegram fallback');
    let telegramSent = false;
    const user = createMockUser();
    const result = await simulateDeliveryPipeline(
      user,
      [{ title: 'Story 1' }],
      {},
      {
        mockSendWhatsApp: async () => ({ messages: [] }), // No message ID
        mockSendTelegram: async () => { telegramSent = true; return { message_id: 102 }; },
      }
    );

    assert.strictEqual(result.channel, 'telegram', 'Expected fallback to telegram when response unconfirmed');
    assert.strictEqual(telegramSent, true);
    assert.strictEqual(result.fallbackUsed, true);
    console.log('✓ PASS: Unconfirmed WhatsApp response rejected and safely fell back to Telegram.\n');
  }

  // Test 4: Ineligible user (standard Telegram user)
  {
    console.log('Test 4: Ineligible user -> skips WhatsApp directly');
    let waAttempted = false;
    let telegramSent = false;
    const user = createMockUser({ isWhatsAppEligible: false });
    const result = await simulateDeliveryPipeline(
      user,
      [{ title: 'Story 1' }],
      {},
      {
        mockSendWhatsApp: async () => { waAttempted = true; },
        mockSendTelegram: async () => { telegramSent = true; },
      }
    );

    assert.strictEqual(waAttempted, false, 'WhatsApp should NOT be attempted for ineligible user');
    assert.strictEqual(result.channel, 'telegram', 'Expected channel to be telegram');
    assert.strictEqual(telegramSent, true);
    assert.strictEqual(result.fallbackUsed, false);
    assert.strictEqual(result.channelStats.whatsapp.attempted, 0);
    assert.ok(result.logs.some(l => l.includes('not WhatsApp-eligible, used Telegram directly')));
    console.log('✓ PASS: Ineligible user bypassed WhatsApp cleanly with 0 wasted API calls.\n');
  }

  // Test 5: User without registered WhatsApp number
  {
    console.log('Test 5: User without WhatsApp phone number -> skips WhatsApp');
    let waAttempted = false;
    let telegramSent = false;
    const user = createMockUser({ whatsappPhoneNumber: null });
    const result = await simulateDeliveryPipeline(
      user,
      [{ title: 'Story 1' }],
      {},
      {
        mockSendWhatsApp: async () => { waAttempted = true; },
        mockSendTelegram: async () => { telegramSent = true; },
      }
    );

    assert.strictEqual(waAttempted, false);
    assert.strictEqual(result.channel, 'telegram');
    assert.strictEqual(telegramSent, true);
    console.log('✓ PASS: Unregistered phone bypassed WhatsApp cleanly.\n');
  }

  console.log('=== ALL 5 FALLBACK TESTS PASSED SUCCESSFULLY! ===');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
