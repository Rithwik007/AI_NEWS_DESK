const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { requireClerkAuth } = require('../middleware/auth');

/**
 * POST /api/auth/sync
 * Idempotently syncs authenticated Clerk user into MongoDB User collection.
 * Creates a new User record if first time logging in, or returns existing record.
 */
router.post('/sync', requireClerkAuth, async (req, res) => {
  try {
    const clerkUserId = req.auth.userId;

    const result = await User.findOneAndUpdate(
      { clerkUserId },
      { $setOnInsert: { clerkUserId } },
      { upsert: true, new: true, includeResultMetadata: true }
    );
    const user = result.value;
    const isNew = !result.lastErrorObject.updatedExisting;

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
