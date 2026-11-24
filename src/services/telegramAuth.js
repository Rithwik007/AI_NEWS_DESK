const crypto = require('crypto');
const User = require('../models/User');

// Character set for link codes: uppercase alphanumeric, omitting ambiguous 0/O, 1/I
const CHARSET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/**
 * Generate a random 6-character link code.
 *
 * @param {number} length
 * @returns {string}
 */
function createRandomCode(length = 6) {
  const bytes = crypto.randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i++) {
    code += CHARSET[bytes[i] % CHARSET.length];
  }
  return code;
}

/**
 * Generate a temporary Telegram linking code for a Clerk user.
 * Overwrites any existing unexpired code with a fresh 10-minute code.
 *
 * @param {string} clerkUserId
 * @param {number} [ttlMs=600000] - Default 10 minutes
 * @returns {Promise<{ clerkUserId: string, code: string, expiry: Date }>}
 */
async function generateTelegramLinkCode(clerkUserId, ttlMs = 10 * 60 * 1000) {
  if (!clerkUserId || typeof clerkUserId !== 'string') {
    throw new Error('clerkUserId is required and must be a string');
  }

  const code = createRandomCode(6);
  const expiry = new Date(Date.now() + ttlMs);

  const user = await User.findOneAndUpdate(
    { clerkUserId: clerkUserId.trim() },
    {
      $set: {
        telegramLinkCode: code,
        telegramLinkCodeExpiry: expiry,
      },
      $setOnInsert: {
        createdAt: new Date(),
        telegramChatId: null,
        telegramLinkedAt: null,
      },
    },
    { upsert: true, new: true }
  );

  return {
    clerkUserId: user.clerkUserId,
    code,
    expiry,
  };
}

/**
 * Validate a link code sent by a Telegram user and link their chat ID.
 * One-time use: consumes the code upon success.
 *
 * @param {string} rawCode
 * @param {string|number} chatId
 * @returns {Promise<{ success: boolean, reason?: string, message: string, user?: Object }>}
 */
async function verifyAndLinkTelegramCode(rawCode, chatId) {
  if (!rawCode || typeof rawCode !== 'string') {
    return {
      success: false,
      reason: 'MISSING_CODE',
      message: '❌ Please provide a link code (e.g. `/start ABC123`).',
    };
  }

  if (!chatId) {
    return {
      success: false,
      reason: 'MISSING_CHAT_ID',
      message: '❌ Telegram chat ID could not be identified.',
    };
  }

  const normalizedCode = rawCode.trim().toUpperCase();
  const normalizedChatId = String(chatId).trim();

  const now = new Date();
  const user = await User.findOneAndUpdate(
    { telegramLinkCode: normalizedCode, telegramLinkCodeExpiry: { $gt: now } },
    { $set: { telegramChatId: normalizedChatId, telegramLinkedAt: now, telegramLinkCode: null, telegramLinkCodeExpiry: null } },
    { new: true }
  );
  if (!user) {
    const expired = await User.exists({ telegramLinkCode: normalizedCode });
    return {
      success: false,
      reason: expired ? 'EXPIRED_CODE' : 'INVALID_CODE',
      message: expired
        ? 'This code has expired. Generate a fresh code in your dashboard.'
        : 'Invalid link code. Generate a new code in your dashboard.',
    };
  }

  return {
    success: true,
    message: '✅ Your Telegram account has been linked successfully! You will now receive your daily AI news digest here.',
    user: {
      clerkUserId: user.clerkUserId,
      telegramChatId: user.telegramChatId,
      telegramLinkedAt: user.telegramLinkedAt,
    },
  };
}

module.exports = {
  createRandomCode,
  generateTelegramLinkCode,
  verifyAndLinkTelegramCode,
};
