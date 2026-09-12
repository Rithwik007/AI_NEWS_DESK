const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { requireClerkAuth } = require('../middleware/auth');

/**
 * POST /api/auth/sync
 * Idempotently syncs authenticated Clerk user into MongoDB User collection.
 * Creates a new User record if first time logging in, or returns existing record.
 */
const InterestProfile = require('../models/InterestProfile');
const ArticleRelevance = require('../models/ArticleRelevance');
const TEST_USER_ID = 'user_3J9Rl5FHP3tYTNadS74NSmjwUZi';

router.post('/sync', requireClerkAuth, async (req, res) => {
  try {
    const clerkUserId = req.auth.userId;

    let user = await User.findOne({ clerkUserId });
    let isNew = false;

    if (!user) {
      // Check if temporary test user has data to migrate
      let carriedTelegramChatId = null;
      let carriedTelegramLinkedAt = null;

      if (clerkUserId !== TEST_USER_ID) {
        const testUser = await User.findOne({ clerkUserId: TEST_USER_ID });
        const testProfile = await InterestProfile.findOne({ userId: TEST_USER_ID });

        if (testProfile) {
          console.log(`[Auth API] Migrating InterestProfile and ArticleRelevance from ${TEST_USER_ID} to real user ${clerkUserId}...`);
          await InterestProfile.updateOne({ userId: TEST_USER_ID }, { $set: { userId: clerkUserId } });
          await ArticleRelevance.updateMany({ userId: TEST_USER_ID }, { $set: { userId: clerkUserId } });
          console.log(`[Auth API] ✓ Reassigned InterestProfile and ArticleRelevance to real user ${clerkUserId}`);
        }

        if (testUser && testUser.telegramChatId) {
          carriedTelegramChatId = testUser.telegramChatId;
          carriedTelegramLinkedAt = testUser.telegramLinkedAt;
          console.log(`[Auth API] Carrying over linked Telegram chat ID ${carriedTelegramChatId} to real user ${clerkUserId}`);
          await User.deleteOne({ clerkUserId: TEST_USER_ID });
          console.log(`[Auth API] Removed obsolete test user record (${TEST_USER_ID})`);
        }
      }

      user = await User.create({
        clerkUserId,
        telegramChatId: carriedTelegramChatId,
        telegramLinkCode: null,
        telegramLinkCodeExpiry: null,
        telegramLinkedAt: carriedTelegramLinkedAt,
      });
      isNew = true;
      console.log(`[Auth API] Created and synced User record for real Clerk ID: ${clerkUserId}`);
    } else {
      console.log(`[Auth API] Synced existing User record for Clerk ID: ${clerkUserId}`);
    }

    return res.status(isNew ? 201 : 200).json({
      success: true,
      isNew,
      user: {
        clerkUserId: user.clerkUserId,
        telegramChatId: user.telegramChatId,
        telegramLinkedAt: user.telegramLinkedAt,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    console.error(`[Auth API] Error in /sync: ${err.message}`);
    return res.status(500).json({
      error: 'InternalServerError',
      message: 'Failed to sync user record',
    });
  }
});

/**
 * GET /api/auth/me
 * Returns current authenticated user's details from MongoDB User collection.
 */
router.get('/me', requireClerkAuth, async (req, res) => {
  try {
    const clerkUserId = req.auth.userId;
    const user = await User.findOne({ clerkUserId }).lean();

    if (!user) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'User record not found. Please sync your account first.',
      });
    }

    return res.json({
      success: true,
      user: {
        clerkUserId: user.clerkUserId,
        telegramChatId: user.telegramChatId,
        telegramLinkedAt: user.telegramLinkedAt,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    console.error(`[Auth API] Error in /me: ${err.message}`);
    return res.status(500).json({
      error: 'InternalServerError',
      message: 'Failed to fetch user profile',
    });
  }
});

module.exports = router;
