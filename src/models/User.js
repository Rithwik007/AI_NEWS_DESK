const mongoose = require('mongoose');

/**
 * User schema — connects web identity (Clerk) with Telegram delivery channel.
 *
 * Core fields:
 * - clerkUserId: unique identifier from Clerk auth (source of truth)
 * - telegramChatId: Telegram chat ID where digests are delivered
 * - telegramLinkCode: 6-char temporary OTP code for linking
 * - telegramLinkCodeExpiry: timestamp when code expires (10m window)
 * - telegramLinkedAt: timestamp of successful linking
 */
const userSchema = new mongoose.Schema({
  clerkUserId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  telegramChatId: {
    type: String,
    default: null,
    index: true,
  },
  telegramLinkCode: {
    type: String,
    default: null,
    index: true,
  },
  telegramLinkCodeExpiry: {
    type: Date,
    default: null,
  },
  telegramLinkedAt: {
    type: Date,
    default: null,
  },
  whatsappPhoneNumber: {
    type: String,
    default: null,
    index: true,
  },
  whatsappVerifiedAt: Date,
  whatsappPendingNumber: String,
  whatsappLinkCode: String,
  whatsappLinkExpiry: Date,
  whatsappRegisteredAt: {
    type: Date,
    default: null,
  },
  isWhatsAppEligible: {
    type: Boolean,
    default: false,
    index: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Only verified records claim a number. Legacy registrations can verify in place.
userSchema.index({ whatsappPhoneNumber: 1 }, {
  unique: true, name: 'verified_whatsapp_number', partialFilterExpression: { whatsappVerifiedAt: { $type: 'date' } },
});

const User = require('../db/model')('User', userSchema);

module.exports = User;
