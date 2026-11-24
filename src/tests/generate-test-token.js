require('dotenv').config();
if (!process.env.TEST_CLERK_USER_ID) throw new Error('Set TEST_CLERK_USER_ID to a disposable Clerk test account ID.');
const { clerkClient } = require('@clerk/express');

async function getToken() {
  const session = await clerkClient.sessions.createSession({ userId: process.env.TEST_CLERK_USER_ID });
  const { jwt } = await clerkClient.sessions.getToken(session.id);
  console.log('TEST_CLERK_JWT=' + jwt);
  return jwt;
}

if (require.main === module) {
  getToken().catch(console.error);
}

module.exports = { getToken };
