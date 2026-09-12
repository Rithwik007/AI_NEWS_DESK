const { connectDB, disconnectDB } = require('../db/connect');
const User = require('../models/User');
const { createApp } = require('../api/app');
const { clerkClient } = require('@clerk/express');

async function runClerkAuthTests() {
  console.log('=== STEP 5: CLERK AUTH BACKEND INTEGRATION TEST SUITE ===\n');

  await connectDB();
  const app = createApp();
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    // 1. Get or create a real user in Clerk instance and issue real RS256 JWT session token
    console.log('--- TEST STEP 1: Real Clerk Session Token Generation ---');
    const userList = await clerkClient.users.getUserList({ limit: 1 });
    let clerkUser = userList.data[0];

    if (!clerkUser) {
      console.log('Creating user in Clerk test instance...');
      clerkUser = await clerkClient.users.createUser({
        emailAddress: ['clerk.test.dev@example.com'],
        firstName: 'Clerk',
        lastName: 'Developer',
        skipPasswordRequirement: true,
      });
    }

    console.log(`Clerk User ID: ${clerkUser.id}`);

    // Clean MongoDB state for this clerkUserId before test
    await User.deleteMany({ clerkUserId: clerkUser.id });

    // Issue real session and JWT
    const session = await clerkClient.sessions.createSession({ userId: clerkUser.id });
    const { jwt } = await clerkClient.sessions.getToken(session.id);

    const redactedToken = `${jwt.slice(0, 15)}...${jwt.slice(-10)}`;
    console.log(`Real Clerk Session Token generated: ${redactedToken}`);
    console.log('✓ Token successfully generated from Clerk API\n');

    // 2. Call POST /api/auth/sync with real token
    console.log('--- TEST STEP 2: POST /api/auth/sync (First Login Sync) ---');
    const syncRes1 = await fetch(`${baseUrl}/api/auth/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
    });

    console.log(`HTTP Status: ${syncRes1.status} (expected: 201)`);
    const syncData1 = await syncRes1.json();
    console.log('Response body:', JSON.stringify(syncData1, null, 2));

    if (syncRes1.status !== 201 || !syncData1.isNew) {
      throw new Error(`Expected status 201 with isNew: true, got ${syncRes1.status}`);
    }
    if (syncData1.user.clerkUserId !== clerkUser.id) {
      throw new Error(`clerkUserId mismatch: expected ${clerkUser.id}, got ${syncData1.user.clerkUserId}`);
    }

    const dbUser1 = await User.findOne({ clerkUserId: clerkUser.id }).lean();
    if (!dbUser1) {
      throw new Error('User record not found in MongoDB');
    }
    console.log('✓ Verified: Real User record created in MongoDB on first login\n');

    // 3. Call GET /api/auth/me with real token
    console.log('--- TEST STEP 3: GET /api/auth/me (Protected Route - Scoped User Profile) ---');
    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
    });

    console.log(`HTTP Status: ${meRes.status} (expected: 200)`);
    const meData = await meRes.json();
    console.log('Response body:', JSON.stringify(meData, null, 2));

    if (meRes.status !== 200 || !meData.success) {
      throw new Error(`Expected status 200, got ${meRes.status}`);
    }
    if (meData.user.clerkUserId !== clerkUser.id) {
      throw new Error('Returned clerkUserId does not match authenticated user');
    }
    console.log('✓ Verified: GET /api/auth/me returns scoped profile for authenticated Clerk user\n');

    // 4. Call GET /api/auth/me with no token and garbage token
    console.log('--- TEST STEP 4: Protected Route 401 Rejections (No Token & Invalid Token) ---');
    const noTokenRes = await fetch(`${baseUrl}/api/auth/me`);
    console.log(`No token HTTP Status: ${noTokenRes.status} (expected: 401)`);
    const noTokenData = await noTokenRes.json();
    console.log('No token error body:', noTokenData);

    if (noTokenRes.status !== 401 || noTokenData.error !== 'Unauthorized') {
      throw new Error(`Expected 401 Unauthorized for missing token, got ${noTokenRes.status}`);
    }

    const garbageRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: {
        Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.garbage.signature',
      },
    });
    console.log(`Garbage token HTTP Status: ${garbageRes.status} (expected: 401)`);
    const garbageData = await garbageRes.json();
    console.log('Garbage token error body:', garbageData);

    if (garbageRes.status !== 401 || garbageData.error !== 'Unauthorized') {
      throw new Error(`Expected 401 Unauthorized for garbage token, got ${garbageRes.status}`);
    }
    console.log('✓ Verified: Both missing and invalid tokens rejected with 401 without crashing\n');

    // 5. Call POST /api/auth/sync again with same token (Idempotency)
    console.log('--- TEST STEP 5: POST /api/auth/sync Idempotency Check ---');
    const syncRes2 = await fetch(`${baseUrl}/api/auth/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
    });

    console.log(`HTTP Status: ${syncRes2.status} (expected: 200)`);
    const syncData2 = await syncRes2.json();
    console.log('Response body:', JSON.stringify(syncData2, null, 2));

    if (syncRes2.status !== 200 || syncData2.isNew !== false) {
      throw new Error(`Expected status 200 with isNew: false, got ${syncRes2.status}`);
    }

    const userCountInDb = await User.countDocuments({ clerkUserId: clerkUser.id });
    console.log(`User records in MongoDB for ${clerkUser.id}: ${userCountInDb} (expected: 1)`);

    if (userCountInDb !== 1) {
      throw new Error(`Duplicate user records found! Count: ${userCountInDb}`);
    }
    console.log('✓ Verified: Idempotent sync; no duplicate records created\n');

    console.log('======================================================');
    console.log('ALL 5 CLERK AUTH TESTS PASSED SUCCESSFULLY ✓');
    console.log('======================================================\n');
  } finally {
    server.close();
    await disconnectDB();
  }
}

runClerkAuthTests().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
