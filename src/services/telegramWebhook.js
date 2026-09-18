const config = require('../config');
const User = require('../models/User');
const { sendTelegramMessage } = require('./telegram');
const { verifyAndLinkTelegramCode } = require('./telegramAuth');
const { generateChatResponse, resendLatestDigest } = require('./chat');
const { captureException } = require('./sentry');

/**
 * Handle a single Telegram update object received via webhook.
 *
 * @param {Object} update
 * @returns {Promise<Object|null>}
 */
async function processTelegramUpdate(update) {
  if (!update || !update.message) return null;

  const msg = update.message;
  const chatId = msg.chat?.id;
  const text = (msg.text || '').trim();

  if (!chatId || !text) return null;

  console.log(`[Telegram Webhook] Incoming message from chat ${chatId}: "${text}"`);

  // 1. Check for /start command (linking flow)
  if (text.startsWith('/start')) {
    const parts = text.split(/\s+/);
    const code = parts[1]; // /start <code>

    if (!code) {
      const promptText = '👋 *Welcome to AI News Delivery!*\n\nTo link your Telegram account to your dashboard, send:\n`/start <YOUR_6_CHAR_CODE>`\n\nYou can generate your code in the web dashboard.';
      await sendTelegramMessage(promptText, chatId);
      return { action: 'prompt_code', chatId };
    }

    // Verify and link code
    const result = await verifyAndLinkTelegramCode(code, chatId);
    await sendTelegramMessage(result.message, chatId);

    console.log(`[Telegram Webhook] Link attempt for chat ${chatId} with code "${code}": ${result.success ? 'SUCCESS' : result.reason}`);
    return { action: 'link_attempt', chatId, code, result };
  }

  // 2. Identify user linked to this chat ID
  const user = await User.findOne({ telegramChatId: String(chatId) }).lean();

  if (!user) {
    const unlinkedHelpText = "🤖 You haven't linked your Telegram account to an AI News Desk profile yet.\n\nVisit your web dashboard to generate a 6-character linking code, then send:\n`/start <CODE>` here to link.";
    try {
      await sendTelegramMessage(unlinkedHelpText, chatId);
    } catch (err) {
      console.warn(`[Telegram Webhook] Could not send unlinked help message to chat ${chatId}: ${err.message}`);
    }
    return { action: 'unlinked_help', chatId };
  }

  // 3. Check for /digest on-demand command
  if (text.toLowerCase() === '/digest') {
    await resendLatestDigest(user, chatId);
    return { action: 'resend_digest', chatId, userId: user.clerkUserId };
  }

  // 4. Conversational chat handling
  console.log(`[Telegram Webhook] Processing conversational message from user "${user.clerkUserId}": "${text}"`);
  try {
    const reply = await generateChatResponse(user, text);
    await sendTelegramMessage(reply, chatId);
    return { action: 'chat_reply', chatId, userId: user.clerkUserId, replyLength: reply?.length || 0 };
  } catch (err) {
    console.error(`[Telegram Webhook] Failed to process/send chat reply to chat ${chatId}: ${err.message}`);
    captureException(err, { tags: { component: 'telegram_webhook', action: 'chat_reply' } });
    return null;
  }
}

module.exports = {
  processTelegramUpdate,
};
