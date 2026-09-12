const { connectDB, disconnectDB } = require('../db/connect');
const User = require('../models/User');
const InterestProfile = require('../models/InterestProfile');
const { createApp } = require('../api/app');
const { clerkClient } = require('@clerk/express');
const { verifyAndLinkTelegramCode } = require('../services/telegramAuth');

const TARGET_CLERK_USER_ID = 'user_3J9Rl5FHP3tYTNadS74NSmjwUZi';

async function runTests() {
  console.log('=== MULTI-USER STEP A & B ENDPOINT VERIFICATION SUITE ===\n');

  await connectDB();
  const app = createApp();
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    // -------------------------------------------------------------
    // TEST 1: Direct DB Verification of Step A Migration
    // -------------------------------------------------------------
    console.log('--- TEST 1: Direct DB Query Verification (Step A Migration) ---');
    const migratedProfile = await InterestProfile.findOne({ userId: TARGET_CLERK_USER_ID }).lean();
    const orphanedDefault = await InterestProfile.findOne({ userId: 'default-user' }).lean();

    console.log(`Migrated profile (${TARGET_CLERK_USER_ID}) exists: ${!!migratedProfile}`);
    console.log(`Topic count: ${migratedProfile?.topics?.length || 0}`);
    console.log(`All topics have 384-dim embeddings: ${migratedProfile?.topics?.every((t) => t.embedding?.length === 384)}`);
    console.log(`Orphaned "default-user" profile exists: ${!!orphanedDefault}`);

    if (!migratedProfile || migratedProfile.topics.length !== 9 || orphanedDefault) {
      throw new Error('Test 1 Failed: Migration DB state invalid.');
    }
    console.log('✓ Test 1 Passed: Profile correctly owned by real clerkUserId; zero orphans.\n');

    // -------------------------------------------------------------
    // Obtain Real Clerk Session Token
    // -------------------------------------------------------------
    console.log('--- GENERATING REAL CLERK SESSION TOKEN ---');
    const session = await clerkClient.sessions.createSession({ userId: TARGET_CLERK_USER_ID });
    const { jwt } = await clerkClient.sessions.getToken(session.id);
    console.log(`Token generated: ${jwt.slice(0, 15)}...${jwt.slice(-10)}`);
    console.log('✓ Token ready\n');

    // -------------------------------------------------------------
    // TEST 2: GET /api/interests with real Clerk token
    // -------------------------------------------------------------
    console.log('--- TEST 2: GET /api/interests ---');
    // First test 401 without auth
    const unauthGetRes = await fetch(`${baseUrl}/api/interests`);
    console.log(`Unauthenticated GET status: ${unauthGetRes.status} (expected: 401)`);
    if (unauthGetRes.status !== 401) throw new Error('GET /api/interests must require auth');

    const getRes = await fetch(`${baseUrl}/api/interests`, {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    console.log(`Authenticated GET status: ${getRes.status} (expected: 200)`);
    const getData = await getRes.json();
    console.log(`Retrieved userId: ${getData.userId}`);
    console.log(`Retrieved topic count: ${getData.topics?.length}`);
    console.log(`Sample topic 1: "${getData.topics?.[0]?.topic}" (weight: ${getData.topics?.[0]?.weight})`);

    if (getRes.status !== 200 || getData.topics?.length !== 9 || getData.userId !== TARGET_CLERK_USER_ID) {
      throw new Error('Test 2 Failed: Did not return expected 9-topic profile.');
    }
    console.log('✓ Test 2 Passed: Successfully returned migrated 9-topic profile.\n');

    // -------------------------------------------------------------
    // TEST 3: POST /api/interests — Update with embedding reuse check
    // -------------------------------------------------------------
    console.log('--- TEST 3: POST /api/interests (Embedding Reuse Verification) ---');
    // Test 3a: Adjust weight of first topic, keep all 9 text identical
    const modifiedTopics = getData.topics.map((t, idx) => ({
      topic: t.topic,
      weight: idx === 0 ? 0.95 : t.weight,
    }));

    const postRes1 = await fetch(`${baseUrl}/api/interests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({ topics: modifiedTopics }),
    });

    console.log(`POST status (weight adjustment): ${postRes1.status} (expected: 200)`);
    const postData1 = await postRes1.json();
    console.log(`Reused embeddings: ${postData1.reusedEmbeddings} (expected: 9)`);
    console.log(`New embeddings: ${postData1.newEmbeddings} (expected: 0)`);

    if (postData1.reusedEmbeddings !== 9 || postData1.newEmbeddings !== 0) {
      throw new Error('Test 3a Failed: Expected all 9 embeddings to be reused.');
    }
    console.log('✓ Test 3a Passed: Unchanged topics reused embeddings without re-embedding compute.\n');

    // Test 3b: Add 1 new topic, verify only 1 is newly embedded
    const topicsWithNewOne = [
      ...modifiedTopics,
      { topic: 'Quantum Neural Networks and Quantum Computing in AI', weight: 0.8 },
    ];

    const postRes2 = await fetch(`${baseUrl}/api/interests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({ topics: topicsWithNewOne }),
    });

    const postData2 = await postRes2.json();
    console.log(`POST status (add new topic): ${postRes2.status} (expected: 200)`);
    console.log(`Total topics: ${postData2.count} (expected: 10)`);
    console.log(`Reused embeddings: ${postData2.reusedEmbeddings} (expected: 9)`);
    console.log(`New embeddings: ${postData2.newEmbeddings} (expected: 1)`);

    if (postData2.reusedEmbeddings !== 9 || postData2.newEmbeddings !== 1) {
      throw new Error('Test 3b Failed: Expected 9 reused and 1 newly embedded.');
    }
    console.log('✓ Test 3b Passed: Exactly 1 new topic embedded via transformers.js model.\n');

    // Restore original 9 topics with initial weights
    await fetch(`${baseUrl}/api/interests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        topics: getData.topics.map((t) => ({ topic: t.topic, weight: t.weight })),
      }),
    });
    console.log('✓ Restored original 9 topics & weights.\n');

    // -------------------------------------------------------------
    // TEST 4: POST /api/telegram/link-code Auth & Scoping Check
    // -------------------------------------------------------------
    console.log('--- TEST 4: POST /api/telegram/link-code ---');
    const unauthCodeRes = await fetch(`${baseUrl}/api/telegram/link-code`, {
      method: 'POST',
    });
    console.log(`Unauthenticated link-code status: ${unauthCodeRes.status} (expected: 401)`);
    if (unauthCodeRes.status !== 401) throw new Error('link-code must reject unauthenticated requests');

    const authCodeRes = await fetch(`${baseUrl}/api/telegram/link-code`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}` },
    });
    console.log(`Authenticated link-code status: ${authCodeRes.status} (expected: 200)`);
    const authCodeData = await authCodeRes.json();
    console.log(`Generated code: ${authCodeData.code}`);
    console.log(`Expiry: ${authCodeData.expiry}`);

    // Verify DB user has this code tied to real clerkUserId
    const dbUserAfterCode = await User.findOne({ clerkUserId: TARGET_CLERK_USER_ID });
    console.log(`DB User clerkUserId: ${dbUserAfterCode.clerkUserId}`);
    console.log(`DB User telegramLinkCode matches API: ${dbUserAfterCode.telegramLinkCode === authCodeData.code}`);

    if (!authCodeData.code || dbUserAfterCode.telegramLinkCode !== authCodeData.code) {
      throw new Error('Test 4 Failed: Generated code mismatch in MongoDB.');
    }
    console.log('✓ Test 4 Passed: Protected link code endpoint generates code scoped to verified req.auth.userId.\n');

    // -------------------------------------------------------------
    // TEST 5: GET /api/telegram/status (before and after linking)
    // -------------------------------------------------------------
    console.log('--- TEST 5: GET /api/telegram/status ---');
    // Ensure initial unlinked state
    await User.updateOne(
      { clerkUserId: TARGET_CLERK_USER_ID },
      { $set: { telegramChatId: null, telegramLinkedAt: null } }
    );

    const statusBefore = await fetch(`${baseUrl}/api/telegram/status`, {
      headers: { Authorization: `Bearer ${jwt}` },
    }).then((r) => r.json());

    console.log('Status BEFORE linking:', JSON.stringify(statusBefore));
    if (statusBefore.linked !== false || statusBefore.telegramChatId !== null) {
      throw new Error('Test 5 Failed: Expected linked: false before linking.');
    }

    // Now simulate linking with the generated code
    console.log(`Simulating user linking Telegram with code: ${authCodeData.code}...`);
    const linkResult = await verifyAndLinkTelegramCode(authCodeData.code, '7106031577');
    console.log('Link result success:', linkResult.success);

    const statusAfter = await fetch(`${baseUrl}/api/telegram/status`, {
      headers: { Authorization: `Bearer ${jwt}` },
    }).then((r) => r.json());

    console.log('Status AFTER linking:', JSON.stringify(statusAfter));
    if (statusAfter.linked !== true || String(statusAfter.telegramChatId) !== '7106031577') {
      throw new Error('Test 5 Failed: Expected linked: true with telegramChatId after linking.');
    }
    console.log('✓ Test 5 Passed: GET /api/telegram/status correctly reflects linked: false then linked: true.\n');

    console.log('====================================================');
    console.log('ALL 5 TESTS PASSED SUCCESSFULLY');
    console.log('====================================================\n');
  } finally {
    server.close();
    await disconnectDB();
  }
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test execution failed:', err);
    process.exit(1);
  });
