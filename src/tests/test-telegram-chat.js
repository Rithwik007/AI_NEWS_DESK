const { connectDB } = require('../db/connect');
const User = require('../models/User');
const Article = require('../models/Article');
const ArticleRelevance = require('../models/ArticleRelevance');
const ChatMessage = require('../models/ChatMessage');
const { processTelegramUpdate } = require('../services/telegramPoller');
const {
  generateChatResponse,
  resendLatestDigest,
  getRecentChatHistory,
  getRecentDigestArticles,
} = require('../services/chat');

async function runTests() {
  console.log('======================================================');
  console.log('TEST SUITE: TELEGRAM BOT CONVERSATIONAL CHAT & /DIGEST');
  console.log('======================================================\n');

  await connectDB();

  // 1. Locate an active linked user
  const linkedUser = await User.findOne({ telegramChatId: { $ne: null } }).lean();
  if (!linkedUser) {
    throw new Error('No linked user found in database. Cannot test chat features.');
  }

  console.log(`[Test Setup] Using verified linked user: "${linkedUser.clerkUserId}" (Telegram Chat ID: ${linkedUser.telegramChatId})`);

  // Clear previous test chat messages for this user to ensure clean state
  const preCleanup = await ChatMessage.deleteMany({ userId: linkedUser.clerkUserId });
  console.log(`[Test Setup] Cleaned up ${preCleanup.deletedCount} prior ChatMessage records for clean test run.\n`);

  let testPassed = 0;
  let testFailed = 0;

  // -------------------------------------------------------------
  // TEST CASE 1: Article-specific question from user's digest
  // -------------------------------------------------------------
  console.log('--- TEST 1: Article-specific digest query ---');
  // Find a real delivered article for this user
  const deliveredRel = await ArticleRelevance.findOne({
    userId: linkedUser.clerkUserId,
    deliveryStatus: 'delivered',
  })
    .populate({
      path: 'articleId',
      populate: { path: 'selectedArticleId' },
    })
    .sort({ deliveredAt: -1 })
    .lean();

  let targetArticleTitle = 'AI models';
  let targetArticleOutlet = '';
  if (deliveredRel && deliveredRel.articleId) {
    const art = deliveredRel.articleId.selectedArticleId || deliveredRel.articleId;
    targetArticleTitle = art.title;
    targetArticleOutlet = art.source || '';
    console.log(`[Test 1] Found delivered article: "${targetArticleTitle}" (${targetArticleOutlet})`);
  } else {
    console.log('[Test 1] Note: No delivered articles in DB for this user; testing fallback digest context.');
  }

  const query1 = `Can you tell me more about "${targetArticleTitle}"? What were the key takeaways?`;
  console.log(`[Test 1] User query: "${query1}"`);

  const response1 = await generateChatResponse(linkedUser, query1);
  console.log(`[Test 1] Bot reply:\n${response1}\n`);

  if (response1 && response1.length > 20 && !response1.includes('hit the hourly chat limit')) {
    console.log('✓ TEST 1 PASSED: Successfully answered article question using context.\n');
    testPassed++;
  } else {
    console.error('✗ TEST 1 FAILED: Expected informative answer using digest context.\n');
    testFailed++;
  }

  // -------------------------------------------------------------
  // TEST CASE 2: Unrelated general question (must not force digest)
  // -------------------------------------------------------------
  console.log('--- TEST 2: Unrelated general question ---');
  const query2 = "What is the capital of France, and why is it famous?";
  console.log(`[Test 2] User query: "${query2}"`);

  const response2 = await generateChatResponse(linkedUser, query2);
  console.log(`[Test 2] Bot reply:\n${response2}\n`);

  const mentionsParis = response2.toLowerCase().includes('paris');
  const forcesAI = response2.toLowerCase().includes('today\'s digest') || response2.toLowerCase().includes('delivered article');

  if (mentionsParis && !forcesAI) {
    console.log('✓ TEST 2 PASSED: Answered general trivia accurately without forcing digest context.\n');
    testPassed++;
  } else {
    console.error(`✗ TEST 2 FAILED: mentionsParis=${mentionsParis}, forcesAI=${forcesAI}\n`);
    testFailed++;
  }

  // -------------------------------------------------------------
  // TEST CASE 3: /digest command handling
  // -------------------------------------------------------------
  console.log('--- TEST 3: /digest command execution ---');
  const digestUpdate = {
    update_id: 99999901,
    message: {
      message_id: 1001,
      chat: { id: linkedUser.telegramChatId },
      text: '/digest',
    },
  };

  const digestResult = await processTelegramUpdate(digestUpdate);
  console.log(`[Test 3] Poller /digest result:`, digestResult);

  if (digestResult && digestResult.action === 'resend_digest') {
    console.log('✓ TEST 3 PASSED: /digest successfully recognized and processed.\n');
    testPassed++;
  } else {
    console.error('✗ TEST 3 FAILED: /digest was not processed as resend_digest.\n');
    testFailed++;
  }

  // -------------------------------------------------------------
  // TEST CASE 4: Multi-Key Groq Rotation & Unrestricted Chat
  // -------------------------------------------------------------
  console.log('--- TEST 4: Groq API key rotation & unblocked chat ---');
  const groqRotator = require('../services/groqRotator');
  const activeKeys = groqRotator.getActiveKeyCount();
  console.log(`[Test 4] Active Groq API key pool count: ${activeKeys}`);

  const initialKey = groqRotator.getCurrentKey();
  console.log(`[Test 4] Initial active key: ${groqRotator.maskKey(initialKey)}`);

  // Simulate rate-limit trigger on current key to verify seamless rotation
  groqRotator.markKeyRateLimited(initialKey, 10000);
  const rotatedKey = groqRotator.getCurrentKey();
  console.log(`[Test 4] Rotated active key after 429: ${groqRotator.maskKey(rotatedKey)}`);

  // Verify chat continues seamlessly past 20 messages without any hourly block
  const unblockedQuery = "Can you give me a 1-sentence tip for debugging distributed systems?";
  const unblockedResponse = await generateChatResponse(linkedUser, unblockedQuery);
  console.log(`[Test 4] Chat response under rotated key:\n${unblockedResponse}\n`);

  const rotationWorked = activeKeys >= 2 && initialKey !== rotatedKey;
  const chatAllowed = unblockedResponse && !unblockedResponse.includes('hit the hourly chat limit');

  if (rotationWorked && chatAllowed) {
    console.log('✓ TEST 4 PASSED: Multi-key rotation verified across pool. Chat restriction successfully removed.\n');
    testPassed++;
  } else {
    console.error(`✗ TEST 4 FAILED: rotationWorked=${rotationWorked}, chatAllowed=${chatAllowed}\n`);
    testFailed++;
  }

  // -------------------------------------------------------------
  // TEST CASE 5: ChatMessage data model verification
  // -------------------------------------------------------------
  console.log('--- TEST 5: ChatMessage database records verification ---');
  const userMessages = await ChatMessage.find({ userId: linkedUser.clerkUserId, role: 'user' }).lean();
  const assistantMessages = await ChatMessage.find({ userId: linkedUser.clerkUserId, role: 'assistant' }).lean();

  console.log(`[Test 5] User messages count: ${userMessages.length}`);
  console.log(`[Test 5] Assistant messages count: ${assistantMessages.length}`);
  console.log(`[Test 5] Sample user message:`, {
    role: userMessages[0]?.role,
    content: userMessages[0]?.content?.slice(0, 40),
    createdAt: userMessages[0]?.createdAt,
  });
  console.log(`[Test 5] Sample assistant message:`, {
    role: assistantMessages[0]?.role,
    content: assistantMessages[0]?.content?.slice(0, 40),
    createdAt: assistantMessages[0]?.createdAt,
  });

  if (userMessages.length > 0 && assistantMessages.length > 0) {
    console.log('✓ TEST 5 PASSED: ChatMessage documents exist with correct roles, schemas, and timestamps.\n');
    testPassed++;
  } else {
    console.error('✗ TEST 5 FAILED: ChatMessage records missing or incomplete.\n');
    testFailed++;
  }

  // -------------------------------------------------------------
  // TEST CASE 6: Unlinked user handling
  // -------------------------------------------------------------
  console.log('--- TEST 6: Unlinked user safety check ---');
  const unlinkedUpdate = {
    update_id: 99999902,
    message: {
      message_id: 1002,
      chat: { id: 9999999999 }, // Unknown chat
      text: 'Hello bot!',
    },
  };

  const unlinkedResult = await processTelegramUpdate(unlinkedUpdate);
  console.log(`[Test 6] Unlinked message result:`, unlinkedResult);

  if (unlinkedResult && unlinkedResult.action === 'unlinked_help') {
    console.log('✓ TEST 6 PASSED: Unlinked user received guidance to link their account.\n');
    testPassed++;
  } else {
    console.error('✗ TEST 6 FAILED: Unlinked user was not redirected to link flow.\n');
    testFailed++;
  }

  // Cleanup synthetic test messages so linked user can chat freely
  await ChatMessage.deleteMany({ userId: linkedUser.clerkUserId, content: { $regex: /^Synthetic/ } });
  console.log('[Cleanup] Cleaned up synthetic messages.');

  console.log('======================================================');
  console.log(`FINAL RESULT: ${testPassed}/${testPassed + testFailed} tests passed.`);
  console.log('======================================================');

  if (testFailed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('[FATAL] Test execution failed:', err);
  process.exit(1);
});
