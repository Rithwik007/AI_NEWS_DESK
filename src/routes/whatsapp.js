const express = require('express');
const router = express.Router();
const User = require('../models/User');
const config = require('../config');
const { requireClerkAuth } = require('../middleware/auth');
const whatsappService = require('../services/whatsapp');
const { cleanPhoneNumber, isPhoneAllowed } = whatsappService;
const { generateChatResponse, resendLatestDigest } = require('../services/chat');

/**
 * Normalizes phone number into E.164 string format (+ followed by digits).
 *
 * @param {string} phone
 * @returns {string|null} E.164 formatted string or null if invalid
 */
function normalizeToE164(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  // Valid international numbers typically have 7 to 15 digits
  if (digits.length < 7 || digits.length > 15) {
    return null;
  }
  return `+${digits}`;
}

/**
 * POST /api/whatsapp/register-number
 * Protected endpoint to register or update the authenticated user's WhatsApp number.
 * Evaluates isWhatsAppEligible against WHATSAPP_ALLOWED_NUMBERS.
 */
router.post('/register-number', requireClerkAuth, async (req, res) => {
  try {
    const clerkUserId = req.auth.userId;
    const { phoneNumber } = req.body || {};

    const formattedNumber = normalizeToE164(phoneNumber);
    if (!formattedNumber) {
      return res.status(400).json({
        error: 'InvalidPhoneNumber',
        message: 'Please provide a valid phone number with country code (e.g. +919876543210).',
      });
    }

    // Check if phone number is already registered to another user
    const existing = await User.findOne({
      whatsappPhoneNumber: formattedNumber,
      clerkUserId: { $ne: clerkUserId },
    }).lean();

    if (existing) {
      return res.status(409).json({
        error: 'PhoneNumberAlreadyRegistered',
        message: 'This WhatsApp phone number is already linked to another account.',
      });
    }

    // Determine eligibility from allowlist
    const isEligible = isPhoneAllowed(formattedNumber);

    const updatedUser = await User.findOneAndUpdate(
      { clerkUserId },
      {
        $set: {
          whatsappPhoneNumber: formattedNumber,
          whatsappRegisteredAt: new Date(),
          isWhatsAppEligible: isEligible,
        },
      },
      { new: true, upsert: true }
    );

    const infoMessage = isEligible
      ? "You're on the list! WhatsApp delivery is now active."
      : "This number isn't on the current invite list. You're all set on Telegram — no changes needed.";

    return res.status(200).json({
      success: true,
      registered: true,
      phoneNumber: updatedUser.whatsappPhoneNumber,
      isWhatsAppEligible: updatedUser.isWhatsAppEligible,
      registeredAt: updatedUser.whatsappRegisteredAt,
      message: infoMessage,
    });
  } catch (err) {
    console.error(`[WhatsApp API] Error in /register-number: ${err.message}`);
    return res.status(500).json({
      error: 'InternalServerError',
      message: `Failed to register WhatsApp number: ${err.message}`,
    });
  }
});

/**
 * GET /api/whatsapp/status
 * Protected endpoint returning whether the user has a registered WhatsApp number and their eligibility.
 */
router.get('/status', requireClerkAuth, async (req, res) => {
  try {
    const clerkUserId = req.auth.userId;
    const user = await User.findOne({ clerkUserId }).lean();

    if (!user || !user.whatsappPhoneNumber) {
      return res.status(200).json({
        success: true,
        registered: false,
        phoneNumber: null,
        isWhatsAppEligible: false,
        registeredAt: null,
      });
    }

    return res.status(200).json({
      success: true,
      registered: true,
      phoneNumber: user.whatsappPhoneNumber,
      isWhatsAppEligible: Boolean(user.isWhatsAppEligible),
      registeredAt: user.whatsappRegisteredAt,
    });
  } catch (err) {
    console.error(`[WhatsApp API] Error in /status: ${err.message}`);
    return res.status(500).json({
      error: 'InternalServerError',
      message: `Failed to check WhatsApp status: ${err.message}`,
    });
  }
});

/**
 * GET /api/whatsapp/webhook
 * Meta Webhook verification handshake.
 */
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === config.WEBHOOK_VERIFY_TOKEN) {
    console.log('[WhatsApp Webhook] Handshake verified successfully.');
    return res.status(200).send(challenge);
  }

  console.warn(`[WhatsApp Webhook] Handshake failed. Expected token: ${config.WEBHOOK_VERIFY_TOKEN ? 'SET' : 'NOT SET'}, received: ${token}`);
  return res.status(403).send('Forbidden');
});

const mongoose = require('mongoose');

/**
 * POST /api/whatsapp/webhook
 * Receives incoming WhatsApp messages & events from Meta.
 */
router.post('/webhook', async (req, res) => {
  // Acknowledge receipt to Meta immediately (Meta requires fast 200 response)
  res.status(200).send('EVENT_RECEIVED');

  try {
    if (mongoose.connection?.readyState === 1) {
      await mongoose.connection.collection('whatsapp_webhook_logs').insertOne({
        receivedAt: new Date(),
        body: req.body,
      });
    }
  } catch (_) {}

  try {
    const body = req.body;
    if (!body || body.object !== 'whatsapp_business_account') {
      return;
    }

    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    // Check if this payload contains incoming messages
    if (!value?.messages || value.messages.length === 0) {
      // Could be status update (sent/delivered/read)
      return;
    }

    const message = value.messages[0];
    const from = message.from; // Digits only e.g. "919876543210"
    if (!from) return;

    let text = '';
    if (message.type === 'text') {
      text = message.text?.body || '';
    } else if (message.type === 'button') {
      text = message.button?.text || '';
    } else if (message.type === 'interactive') {
      text = message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || '';
    }

    text = text.trim();
    if (!text) return;

    console.log(`[WhatsApp Webhook] Message from ${from}: "${text}"`);

    const rawDigits = cleanPhoneNumber(from);
    const e164 = `+${rawDigits}`;

    // Find linked user by e164 or digits
    const user = await User.findOne({
      whatsappPhoneNumber: { $in: [e164, rawDigits] },
    });

    if (!user) {
      console.log(`[WhatsApp Webhook] Sender ${from} not found in User records.`);
      const onboardingMsg = `👋 Welcome to AI News Desk!\n\nYour WhatsApp number is not linked yet. Please sign in to your dashboard to link your number and receive AI news digests:\n${config.FRONTEND_URL}`;
      await whatsappService.sendWhatsAppMessage(from, onboardingMsg);
      return;
    }

    // Handle "digest" command
    if (text.toLowerCase() === 'digest') {
      console.log(`[WhatsApp Webhook] User "${user.clerkUserId}" requested digest via WhatsApp.`);
      await resendLatestDigest(user, from, { channel: 'whatsapp' });
      return;
    }

    // Handle conversational chat
    console.log(`[WhatsApp Webhook] Routing query from "${user.clerkUserId}" to AI chat.`);
    const reply = await generateChatResponse(user, text, {
      channel: 'whatsapp',
      senderId: from,
    });

    await whatsappService.sendWhatsAppMessage(from, reply);
    console.log(`[WhatsApp Webhook] Reply sent to ${from}.`);
  } catch (err) {
    console.error(`[WhatsApp Webhook] Error processing event: ${err.message}`, err);
    try {
      if (mongoose.connection?.readyState === 1) {
        await mongoose.connection.collection('whatsapp_webhook_logs').insertOne({
          receivedAt: new Date(),
          error: err.message,
          stack: err.stack,
        });
      }
    } catch (_) {}
  }
});

/**
 * GET /api/whatsapp/recent-logs
 * Debug endpoint returning last 10 webhook events received by backend.
 */
router.get('/recent-logs', async (req, res) => {
  try {
    const logs = await mongoose.connection.collection('whatsapp_webhook_logs')
      .find({})
      .sort({ receivedAt: -1 })
      .limit(10)
      .toArray();
    return res.status(200).json({ count: logs.length, logs });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
