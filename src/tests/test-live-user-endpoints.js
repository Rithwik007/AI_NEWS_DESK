require('dotenv').config();
const config = require('../config');

async function testLiveEndpointsWithClerkToken() {
  console.log('Testing live Render backend with real Clerk session token...');
  const clerkUserId = 'user_3JEiVTkaMiLMxjxLMFeqJkv3FO8'; // vsnira456@gmail.com

  // 1. Create a session or sign-in token via Clerk backend API
  // Using Clerk API: POST https://api.clerk.com/v1/tokens to create a testing token or impersonation token
  // Or create session via POST https://api.clerk.com/v1/sessions
  console.log(`Creating Clerk session for user ${clerkUserId}...`);
  const sessionRes = await fetch('https://api.clerk.com/v1/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.CLERK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ user_id: clerkUserId }),
  });

  const sessionData = await sessionRes.json();
  if (!sessionRes.ok) {
    console.error('Failed to create Clerk session:', sessionData);
    return;
  }

  const sessionId = sessionData.id;
  console.log(`Session created: ${sessionId}. Creating session token...`);

  const tokenRes = await fetch(`https://api.clerk.com/v1/sessions/${sessionId}/tokens`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.CLERK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  const tokenData = await tokenRes.json();
  if (!tokenRes.ok) {
    console.error('Failed to create session token:', tokenData);
    return;
  }

  const jwt = tokenData.jwt;
  console.log('Obtained Clerk JWT successfully! Length:', jwt.length);

  const target = process.env.TEST_TARGET || 'remote';
  let backendUrl;
  let server;

  if (target === 'local') {
    const { createApp } = require('../api/app');
    const { connectDB } = require('../db/connect');
    await connectDB();
    const app = createApp();
    server = app.listen(0);
    const port = server.address().port;
    backendUrl = `http://localhost:${port}`;
    console.log(`Testing against LOCAL server: ${backendUrl}`);
  } else {
    backendUrl = 'https://ai-news-backend-rmdj.onrender.com';
    console.log(`Testing against REMOTE server: ${backendUrl}`);
  }

  // Test 1: GET /api/telegram/status
  console.log('\n--- 1. Testing GET /api/telegram/status ---');
  const t0 = Date.now();
  const tgStatusRes = await fetch(`${backendUrl}/api/telegram/status`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  console.log(`HTTP ${tgStatusRes.status} (${Date.now() - t0}ms):`, await tgStatusRes.text());

  // Test 2: GET /api/whatsapp/status
  console.log('\n--- 2. Testing GET /api/whatsapp/status ---');
  const t1 = Date.now();
  const waStatusRes = await fetch(`${backendUrl}/api/whatsapp/status`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  console.log(`HTTP ${waStatusRes.status} (${Date.now() - t1}ms):`, await waStatusRes.text());

  // Test 3: POST /api/telegram/link-code
  console.log('\n--- 3. Testing POST /api/telegram/link-code ---');
  const t2 = Date.now();
  const linkCodeRes = await fetch(`${backendUrl}/api/telegram/link-code`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
  });
  console.log(`HTTP ${linkCodeRes.status} (${Date.now() - t2}ms):`, await linkCodeRes.text());

  if (server) {
    server.close();
    const { disconnectDB } = require('../db/connect');
    await disconnectDB();
  }
}

testLiveEndpointsWithClerkToken().catch(console.error);
