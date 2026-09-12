const { connectDB, disconnectDB } = require('../db/connect');
const InterestProfile = require('../models/InterestProfile');

const TARGET_CLERK_USER_ID = 'user_3J9Rl5FHP3tYTNadS74NSmjwUZi';

async function migrate() {
  console.log('=== ONE-TIME MIGRATION: InterestProfile Ownership ===');
  await connectDB();

  try {
    const defaultProfile = await InterestProfile.findOne({ userId: 'default-user' });

    if (!defaultProfile) {
      console.log('No profile found with userId: "default-user". Checking target user...');
      const targetProfile = await InterestProfile.findOne({ userId: TARGET_CLERK_USER_ID });
      if (targetProfile) {
        console.log(`✓ Profile already migrated to ${TARGET_CLERK_USER_ID} with ${targetProfile.topics.length} topics.`);
        return targetProfile;
      }
      throw new Error('Neither "default-user" nor target profile found.');
    }

    console.log(`Found "default-user" profile with ${defaultProfile.topics.length} topics.`);

    // Check if target user profile exists
    const existingTarget = await InterestProfile.findOne({ userId: TARGET_CLERK_USER_ID });
    if (existingTarget) {
      console.log(`Target profile for ${TARGET_CLERK_USER_ID} already exists. Replacing with default-user topics...`);
      existingTarget.topics = defaultProfile.topics;
      existingTarget.updatedAt = new Date();
      await existingTarget.save();
      await InterestProfile.deleteOne({ _id: defaultProfile._id });
    } else {
      defaultProfile.userId = TARGET_CLERK_USER_ID;
      defaultProfile.updatedAt = new Date();
      await defaultProfile.save();
    }

    // Verify migration
    const verifyTarget = await InterestProfile.findOne({ userId: TARGET_CLERK_USER_ID }).lean();
    const verifyDefault = await InterestProfile.findOne({ userId: 'default-user' }).lean();

    console.log('\n--- Migration Verification ---');
    console.log(`Target userId (${TARGET_CLERK_USER_ID}) exists: ${!!verifyTarget}`);
    console.log(`Target topic count: ${verifyTarget?.topics?.length || 0}`);
    console.log(`Old "default-user" profile exists: ${!!verifyDefault}`);

    if (verifyTarget && verifyTarget.topics.length > 0 && !verifyDefault) {
      console.log('✓ Migration succeeded with 0 orphaned profiles.');
    } else {
      throw new Error('Migration verification failed.');
    }

    return verifyTarget;
  } finally {
    await disconnectDB();
  }
}

if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}

module.exports = { migrate };
