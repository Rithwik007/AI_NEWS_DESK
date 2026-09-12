const { connectDB, disconnectDB } = require('../db/connect');
const User = require('../models/User');
const BotState = require('../models/BotState');
const config = require('../config');
const { generateTelegramLinkCode } = require('../services/telegramAuth');
const {
  getLastUpdateId,
  startTelegramPoller,
  processTelegramUpdate,
} = require('../services/telegramPoller');

async function testPollerOffset() {
  console.log('=== TEST: TELEGRAM POLLER OFFSET PERSISTENCE ACROSS RESTARTS ===\n');
  await connectDB();

  const testUserId = 'clerk_test_offset_user';
  const realChatId = config.TELEGRAM_CHAT_ID;

  try {
    // 1. Reset test state
    await User.deleteMany({ clerkUserId: testUserId });
    await BotState.deleteMany({ key: 'telegram_last_update_id' });

    console.log('--- STEP 1: Initial Poller State ---');
    const initialLastId = await getLastUpdateId();
    console.log(`Initial stored last_update_id: ${initialLastId} (expected: 0)`);
    if (initialLastId !== 0) throw new Error('Initial last_update_id should be 0');

    // 2. Generate link code for test user
    const { code } = await generateTelegramLinkCode(testUserId);
    console.log(`Generated link code: ${code}`);

    // 3. Run Poller Session 1 with update_id = 50001
    console.log('\n--- STEP 2: Poller Session 1 (Processes update_id 50001) ---');
    const simulatedUpdateId = 50001;
    let session1OffsetPassed = null;

    const mockFetchSession1 = async (offset) => {
      session1OffsetPassed = offset;
      console.log(`[Session 1] Poller fetched with offset: ${offset}`);
      return [
        {
          update_id: simulatedUpdateId,
          message: {
            message_id: 101,
            from: { id: parseInt(realChatId, 10), first_name: 'Tester' },
            chat: { id: parseInt(realChatId, 10), type: 'private' },
            date: Math.floor(Date.now() / 1000),
            text: `/start ${code}`,
          },
        },
      ];
    };

    // Run Session 1
    await startTelegramPoller({
      fetchUpdates: mockFetchSession1,
      maxPolls: 1,
      timeout: 0,
      pollDelayMs: 0,
    });

    // Verify Session 1 results
    const userAfterSession1 = await User.findOne({ clerkUserId: testUserId }).lean();
    console.log(`User linked in Session 1: telegramChatId=${userAfterSession1.telegramChatId}`);
    if (String(userAfterSession1.telegramChatId) !== String(realChatId)) {
      throw new Error('User was not linked in Session 1');
    }

    const storedLastId = await getLastUpdateId();
    console.log(`DB stored last_update_id after Session 1: ${storedLastId} (expected: ${simulatedUpdateId})`);
    if (storedLastId !== simulatedUpdateId) {
      throw new Error(`Expected stored last_update_id ${simulatedUpdateId}, got ${storedLastId}`);
    }

    // 4. Poller Shutdown & Restart (Session 2)
    console.log('\n--- STEP 3: Poller Restart (Session 2) ---');
    console.log('Simulating poller process restart (re-instantiating poller from DB state)...');

    let session2OffsetPassed = null;
    let session2ProcessedCount = 0;

    const mockFetchSession2 = async (offset) => {
      session2OffsetPassed = offset;
      console.log(`[Session 2] Poller called getUpdates with offset: ${offset}`);

      // Telegram server contract:
      // If client sends offset <= update_id, it re-returns unacknowledged updates.
      // If client sends offset > update_id (50002), Telegram discards update 50001 and returns [].
      if (offset <= simulatedUpdateId) {
        // Bug simulation: old update re-sent
        return [
          {
            update_id: simulatedUpdateId,
            message: {
              message_id: 101,
              chat: { id: parseInt(realChatId, 10) },
              text: `/start ${code}`,
            },
          },
        ];
      }

      // Correct behavior
      return [];
    };

    const spyProcessSession2 = async (update) => {
      session2ProcessedCount++;
      return processTelegramUpdate(update);
    };

    // Run Session 2 without explicit offset (must auto-load lastUpdateId + 1 from DB)
    await startTelegramPoller({
      fetchUpdates: mockFetchSession2,
      processUpdate: spyProcessSession2,
      maxPolls: 1,
      timeout: 0,
      pollDelayMs: 0,
    });

    console.log(`Session 2 offset passed to Telegram: ${session2OffsetPassed} (expected: ${simulatedUpdateId + 1})`);
    console.log(`Session 2 updates reprocessed: ${session2ProcessedCount} (expected: 0)`);

    if (session2OffsetPassed !== simulatedUpdateId + 1) {
      throw new Error(`Expected offset ${simulatedUpdateId + 1}, got ${session2OffsetPassed}`);
    }
    if (session2ProcessedCount !== 0) {
      throw new Error(`Duplicate processing occurred! Count: ${session2ProcessedCount}`);
    }

    console.log('\n✓ Poller restart verified: offset persisted to MongoDB, Session 2 initialized with last_id + 1, zero duplicate processing');

    // Cleanup
    await User.deleteMany({ clerkUserId: testUserId });
    await BotState.deleteMany({ key: 'telegram_last_update_id' });
    console.log('Test artifacts cleaned up.');
  } finally {
    await disconnectDB();
  }
}

testPollerOffset().catch((err) => {
  console.error('Offset test failed:', err);
  process.exit(1);
});
