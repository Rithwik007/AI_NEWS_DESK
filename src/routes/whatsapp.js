const { createHmac, timingSafeEqual, randomBytes } = require('node:crypto');
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

    if (!process.env.WHATSAPP_APP_SECRET) {
      return res.status(503).json({ message: 'WhatsApp linking is temporarily unavailable. You can connect Telegram.' });
    }
    if (!config.WHATSAPP_ACCESS_TOKEN || !isPhoneAllowed(formattedNumber)) {
      return res.status(403).json({ message: 'WhatsApp is available to invited numbers. You can link Telegram for delivery.' });
    }
    const code = randomBytes(8).toString('hex');
    await User.updateOne({ clerkUserId }, { $set: {
      whatsappPendingNumber: formattedNumber,
      whatsappLinkCode: code,
      whatsappLinkExpiry: new Date(Date.now() + 10 * 60_000),
    } }, { upsert: true });
    return res.json({ success: true, message: `Send “link ${code}” from this number to the desk’s WhatsApp account within 10 minutes, then check your connection below.` });
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

    if (!user?.whatsappVerifiedAt || !user.whatsappPhoneNumber) {
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
      isWhatsAppEligible: Boolean(process.env.WHATSAPP_APP_SECRET) && isPhoneAllowed(user.whatsappPhoneNumber),
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

  if (mode === 'subscribe' && config.WEBHOOK_VERIFY_TOKEN && token === config.WEBHOOK_VERIFY_TOKEN) {
    console.log('[WhatsApp Webhook] Handshake verified successfully.');
    return res.status(200).send(challenge);
  }

  console.warn('[WhatsApp Webhook] Handshake failed.');
  return res.status(403).send('Forbidden');
});



/**
 * POST /api/whatsapp/webhook
 * Receives incoming WhatsApp messages & events from Meta.
 */
router.post('/webhook', async (req, res) => {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !req.rawBody) return res.sendStatus(403);
  const expected = Buffer.from('sha256=' + createHmac('sha256', secret).update(req.rawBody).digest('hex'));
  const provided = Buffer.from(req.get('x-hub-signature-256') || '');
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return res.sendStatus(403);
  res.status(200).send('EVENT_RECEIVED');

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


    const rawDigits = cleanPhoneNumber(from);
    const e164 = `+${rawDigits}`;

    if (!isPhoneAllowed(e164)) return;
    const link = /^link\s+([a-f0-9]{16})$/i.exec(text);
    if (link) {
      let confirmed = false;
      try {
        const result = await User.updateOne({
          whatsappPendingNumber: e164, whatsappLinkCode: link[1].toLowerCase(),
          whatsappLinkExpiry: { $gt: new Date() },
        }, {
          $set: { whatsappPhoneNumber: e164, whatsappVerifiedAt: new Date(), whatsappRegisteredAt: new Date(), isWhatsAppEligible: true },
          $unset: { whatsappPendingNumber: '', whatsappLinkCode: '', whatsappLinkExpiry: '' },
        });
        confirmed = result.modifiedCount === 1;
      } catch (err) {
        if (err.code !== 11000) throw err;
      }
      await whatsappService.sendWhatsAppMessage(from, confirmed
        ? 'WhatsApp delivery is connected.'
        : 'Unable to link. Check the account and request a fresh code in your dashboard.');
      return;
    }
    // Find linked user by e164 or digits
    const user = await User.findOne({
      whatsappPhoneNumber: { $in: [e164, rawDigits] }, whatsappVerifiedAt: { $type: 'date' },
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
  }
});

module.exports = router;
