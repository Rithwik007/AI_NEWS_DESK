require('dotenv').config();
const assert = require('assert');
const mongoose = require('mongoose');
const config = require('../config');
const { connectDB, disconnectDB } = require('../db/connect');
const Article = require('../models/Article');
const ArticleRelevance = require('../models/ArticleRelevance');
const InterestProfile = require('../models/InterestProfile');
const telegramService = require('../services/telegram');
const whatsappService = require('../services/whatsapp');
const { resendLatestDigest } = require('../services/chat');

async function runWelcomeDigestTests() {
  console.log('\n================================================================');
  console.log('TEST SUITE: ON-DEMAND WELCOME DIGEST & DUPLICATE PREVENTION');
  console.log('================================================================\n');

  await connectDB();

  const TEST_USER_TG = 'user_test_welcome_tg_' + Date.now();
  const TEST_USER_WA = 'user_test_welcome_wa_' + Date.now();
  const TEST_USER_FALLBACK = 'user_test_welcome_fb_' + Date.now();

  const sentTelegram = [];
  const sentWhatsApp = [];

  const origTg = telegramService.sendTelegramMessage;
  const origWa = whatsappService.sendWhatsAppMessage;

  telegramService.sendTelegramMessage = async (msg, chatId) => {
    sentTelegram.push({ msg, chatId });
    return { ok: true };
  };

  whatsappService.sendWhatsAppMessage = async (to, msg) => {
    sentWhatsApp.push({ to, msg });
    return { success: true };
  };

  try {
    // --------------------------------------------------------------------
    // TEST 1: Brand new user with 0 ArticleRelevance records on Telegram
    // --------------------------------------------------------------------
    console.log('[Test 1] Testing on-demand welcome digest for new user on Telegram...');
    
    // Ensure 0 records exist
    const initialCount = await ArticleRelevance.countDocuments({ userId: TEST_USER_TG });
    assert.strictEqual(initialCount, 0, 'New user must start with 0 ArticleRelevance records');

    const tgUser = { clerkUserId: TEST_USER_TG };
    const deliveredTg = await resendLatestDigest(tgUser, '111222333', { channel: 'telegram' });

    assert.strictEqual(deliveredTg, true, 'resendLatestDigest must return true for successful welcome delivery');
    assert.ok(sentTelegram.length >= 1, 'Telegram messages must have been sent');
    assert.ok(
      sentTelegram[0].msg.includes('Your Welcome AI News Digest'),
      'First message must have Welcome Digest header'
    );
    console.log('✓ Received Welcome Digest on Telegram successfully.');

    // Verify exactly 5 ArticleRelevance records persisted with deliveryStatus: 'delivered'
    const tgRels = await ArticleRelevance.find({ userId: TEST_USER_TG }).lean();
    console.log(`Persisted records for ${TEST_USER_TG}: ${tgRels.length}`);
    assert.strictEqual(tgRels.length, 5, 'Must persist exactly 5 ArticleRelevance records');

    for (const rel of tgRels) {
      assert.strictEqual(rel.isRelevant, true, 'isRelevant must be true');
      assert.strictEqual(rel.deliveryStatus, 'delivered', 'deliveryStatus must be delivered');
      assert.ok(rel.deliveredAt instanceof Date, 'deliveredAt must be a valid Date');
      assert.ok(['high', 'moderate'].includes(rel.confidenceTier), 'confidenceTier must be high or moderate');
      assert.ok(rel.rankingScore >= 0.25, 'rankingScore must be >= 0.25');
    }
    console.log('✓ All 5 ArticleRelevance records verified delivered and persisted.');

    // --------------------------------------------------------------------
    // TEST 2: Duplicate Prevention in Scheduled Runs
    // --------------------------------------------------------------------
    console.log('\n[Test 2] Verifying scheduled delivery query excludes these 5 delivered articles...');
    
    // Exact scheduled pipeline query from src/services/telegram.js
    const scheduledQuery = {
      userId: TEST_USER_TG,
      isRelevant: true,
      confidenceTier: { $in: ['high', 'moderate'] },
      deliveryStatus: { $nin: ['delivered', 'expired'] },
    };

    const scheduledEligible = await ArticleRelevance.find(scheduledQuery);
    console.log(`Articles eligible for scheduled re-delivery: ${scheduledEligible.length}`);
    assert.strictEqual(
      scheduledEligible.length,
      0,
      'Delivered welcome articles MUST NOT be eligible for scheduled run re-delivery'
    );
    console.log('✓ Duplicate prevention verified: 0 duplicate articles for scheduled run.');

    // --------------------------------------------------------------------
    // TEST 3: Subsequent /digest request resends latest digest
    // --------------------------------------------------------------------
    console.log('\n[Test 3] Testing subsequent /digest call from same user...');
    sentTelegram.length = 0; // Clear sent log

    const secondDigestRes = await resendLatestDigest(tgUser, '111222333', { channel: 'telegram' });
    assert.strictEqual(secondDigestRes, true);
    assert.ok(sentTelegram.length >= 1);
    assert.ok(
      sentTelegram[0].msg.includes('Your Latest AI News Digest'),
      'Subsequent call must resend with Latest Digest header'
    );

    const countAfterSecond = await ArticleRelevance.countDocuments({ userId: TEST_USER_TG });
    assert.strictEqual(countAfterSecond, 5, 'Record count must remain 5, no duplicate inserts');
    console.log('✓ Subsequent /digest correctly resends latest digest without duplicate inserts.');

    // --------------------------------------------------------------------
    // TEST 4: Brand new user on WhatsApp
    // --------------------------------------------------------------------
    console.log('\n[Test 4] Testing on-demand welcome digest for new user on WhatsApp...');
    const waUser = { clerkUserId: TEST_USER_WA };
    const deliveredWa = await resendLatestDigest(waUser, '+919876543210', { channel: 'whatsapp' });

    assert.strictEqual(deliveredWa, true);
    assert.ok(sentWhatsApp.length >= 1);
    assert.ok(sentWhatsApp[0].msg.includes('Your Welcome AI News Digest'));

    const waRels = await ArticleRelevance.find({ userId: TEST_USER_WA }).lean();
    assert.strictEqual(waRels.length, 5);
    assert.strictEqual(waRels.every((r) => r.deliveryStatus === 'delivered'), true);
    console.log('✓ WhatsApp welcome digest verified delivered and persisted.');

    // --------------------------------------------------------------------
    // TEST 5: Fallback to Option 1 when < 5 articles pass threshold
    // --------------------------------------------------------------------
    console.log('\n[Test 5] Testing fallback to waiting message when < 5 articles pass...');
    // Create an InterestProfile with an impossibly obscure topic with 0 matches
    await InterestProfile.create({
      userId: TEST_USER_FALLBACK,
      topics: [
        {
          topic: 'ancient 14th century medieval blacksmith hammer forging techniques in Byzantine empire',
          weight: 1.0,
          embedding: new Array(384).fill(0.01),
        },
      ],
    });

    const fallbackUser = { clerkUserId: TEST_USER_FALLBACK };
    sentTelegram.length = 0;

    const fallbackResult = await resendLatestDigest(fallbackUser, '999999999', { channel: 'telegram' });
    assert.strictEqual(fallbackResult, false, 'Must return false when falling back to waiting message');
    assert.ok(sentTelegram.length >= 1);
    assert.ok(
      sentTelegram[0].msg.includes("You're all set!"),
      'Must send Option 1 waiting message explaining scheduled runs'
    );
    assert.ok(
      sentTelegram[0].msg.includes('8:00 AM'),
      'Message must mention scheduled run times'
    );

    const fallbackRels = await ArticleRelevance.countDocuments({ userId: TEST_USER_FALLBACK });
    assert.strictEqual(fallbackRels, 0, 'Zero ArticleRelevance records must be created for failed threshold');
    console.log('✓ Fallback verified: no low-quality articles forced, clear waiting message sent.');

    console.log('\n================================================================');
    console.log('ALL 5 WELCOME DIGEST & DUPLICATE PREVENTION TESTS PASSED! ✓');
    console.log('================================================================\n');
  } finally {
    // Cleanup test data
    console.log('[Cleanup] Removing test records from MongoDB...');
    await ArticleRelevance.deleteMany({
      userId: { $in: [TEST_USER_TG, TEST_USER_WA, TEST_USER_FALLBACK] },
    });
    await InterestProfile.deleteMany({
      userId: { $in: [TEST_USER_TG, TEST_USER_WA, TEST_USER_FALLBACK] },
    });

    telegramService.sendTelegramMessage = origTg;
    whatsappService.sendWhatsAppMessage = origWa;
    await disconnectDB();
  }
}

runWelcomeDigestTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test suite failed:', err);
    process.exit(1);
  });
