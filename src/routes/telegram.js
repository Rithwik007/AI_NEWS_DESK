const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { requireClerkAuth } = require('../middleware/auth');
const { generateTelegramLinkCode } = require('../services/telegramAuth');

/**
 * POST /api/telegram/link-code
 * Protected endpoint to generate a temporary linking code for the authenticated user.
 * Pulls clerkUserId strictly from req.auth.userId (verified token).
 */
router.post('/link-code', requireClerkAuth, async (req, res) => {
  try {
    const clerkUserId = req.auth.userId;
    const { code, expiry } = await generateTelegramLinkCode(clerkUserId);

    return res.status(200).json({
      success: true,
      code,
      expiry,
    });
  } catch (err) {
    console.error(`[Telegram API] Error in /link-code: ${err.message}`);
    return res.status(500).json({
      error: 'InternalServerError',
      message: 'Failed to generate link code',
    });
  }
});

/**
 * GET /api/telegram/status
 * Protected endpoint returning whether the authenticated user has a linked Telegram chat ID.
 * Scoped strictly to req.auth.userId.
 */
router.get('/status', requireClerkAuth, async (req, res) => {
  try {
    const clerkUserId = req.auth.userId;
    const user = await User.findOne({ clerkUserId }).lean();

    if (!user || !user.telegramChatId) {
      return res.status(200).json({
        success: true,
        linked: false,
        telegramChatId: null,
        linkedAt: null,
      });
    }

    return res.status(200).json({
      success: true,
      linked: true,
      telegramChatId: user.telegramChatId,
      linkedAt: user.telegramLinkedAt,
    });
  } catch (err) {
    console.error(`[Telegram API] Error in /status: ${err.message}`);
    return res.status(500).json({
      error: 'InternalServerError',
      message: `Failed to check Telegram linking status: ${err.message}`,
    });
  }
});

module.exports = router;
