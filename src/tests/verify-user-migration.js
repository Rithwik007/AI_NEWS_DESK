require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const InterestProfile = require('../models/InterestProfile');
const ArticleRelevance = require('../models/ArticleRelevance');

const OLD_TEST_ID = 'user_3J9Rl5FHP3tYTNadS74NSmjwUZi';
const REAL_USER_ID = 'user_3JEbz6SSqzGyAWyPDFRx7wvePp1';

async function verify() {
  console.log('=== DATABASE USER MIGRATION AUDIT ===\n');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('[DB] Connected to MongoDB Atlas.\n');

  // 1. User collection
  const allUsers = await User.find({}).lean();
  console.log(`[User Collection] Total users: ${allUsers.length}`);
  allUsers.forEach((u, i) => {
    console.log(`  User ${i + 1}:`);
    console.log(`    clerkUserId:     "${u.clerkUserId}"`);
    console.log(`    telegramChatId:  "${u.telegramChatId}"`);
    console.log(`    telegramLinkedAt: ${u.telegramLinkedAt}`);
    console.log(`    createdAt:        ${u.createdAt}`);
  });

  const oldUserExists = await User.exists({ clerkUserId: OLD_TEST_ID });
  const realUser = await User.findOne({ clerkUserId: REAL_USER_ID }).lean();

  console.log(`\n  Old test user exists in User:  ${!!oldUserExists} (expected: false)`);
  console.log(`  Real user exists in User:      ${!!realUser} (expected: true)`);
  console.log(`  Real user telegramChatId:      ${realUser?.telegramChatId} (expected: 7106031577)`);

  // 2. InterestProfile collection
  const allProfiles = await InterestProfile.find({}).lean();
  console.log(`\n[InterestProfile Collection] Total profiles: ${allProfiles.length}`);
  allProfiles.forEach((p, i) => {
    console.log(`  Profile ${i + 1}:`);
    console.log(`    userId:   "${p.userId}"`);
    console.log(`    topics:   ${p.topics?.length} topics`);
    console.log(`    sample:   "${p.topics?.[0]?.topic?.slice(0, 50)}..."`);
  });

  const oldProfileExists = await InterestProfile.exists({ userId: OLD_TEST_ID });
  const realProfile = await InterestProfile.findOne({ userId: REAL_USER_ID }).lean();

  console.log(`\n  Old test user in InterestProfile: ${!!oldProfileExists} (expected: false)`);
  console.log(`  Real user in InterestProfile:     ${!!realProfile} (expected: true)`);
  console.log(`  Real user topic count:            ${realProfile?.topics?.length} (expected: 9)`);

  // 3. ArticleRelevance collection
  const oldCount = await ArticleRelevance.countDocuments({ userId: OLD_TEST_ID });
  const realCount = await ArticleRelevance.countDocuments({ userId: REAL_USER_ID });
  const totalRels = await ArticleRelevance.countDocuments({});

  console.log(`\n[ArticleRelevance Collection] Total records: ${totalRels}`);
  console.log(`  Records owned by old test user: ${oldCount} (expected: 0)`);
  console.log(`  Records owned by real user:     ${realCount} (expected: 468)`);

  // 4. Check if real user has any delivered records
  const deliveredCount = await ArticleRelevance.countDocuments({
    userId: REAL_USER_ID,
    deliveryStatus: 'delivered',
  });
  console.log(`  Delivered records for real user: ${deliveredCount}`);

  // 5. Final assertion
  const isClean = !oldUserExists && !oldProfileExists && oldCount === 0 && allUsers.length === 1 && realCount === 468;
  console.log(`\n======================================================`);
  console.log(`MIGRATION CLEANLINESS AUDIT: ${isClean ? '100% CLEAN (PASS) ✓' : 'DISCREPANCY FOUND (FAIL) ✗'}`);
  console.log(`======================================================\n`);

  await mongoose.disconnect();
}

verify().catch((err) => {
  console.error('[Audit Error]:', err);
  process.exit(1);
});
