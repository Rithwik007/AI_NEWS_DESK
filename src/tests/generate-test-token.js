require('dotenv').config();
const { clerkClient } = require('@clerk/express');

async function getToken() {
  const session = await clerkClient.sessions.createSession({ userId: 'user_3J9Rl5FHP3tYTNadS74NSmjwUZi' });
  const { jwt } = await clerkClient.sessions.getToken(session.id);
  console.log('TEST_CLERK_JWT=' + jwt);
  return jwt;
}

if (require.main === module) {
  getToken().catch(console.error);
}

module.exports = { getToken };
