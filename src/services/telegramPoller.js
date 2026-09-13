const config = require('../config');
const BotState = require('../models/BotState');
const User = require('../models/User');
const { sendTelegramMessage } = require('./telegram');
const { verifyAndLinkTelegramCode } = require('./telegramAuth');
const { generateChatResponse, resendLatestDigest } = require('./chat');

/**
 * KNOWN ARCHITECTURAL LIMITATION (STEP 6 DEPLOYMENT):
 * Long-polling requires a persistent always-running process — incompatible with Vercel serverless functions as deployed in Step 6.
 * Will need to switch to a Telegram webhook (public HTTPS endpoint) OR run this poller on a separate always-on host (Render/Railway) at deploy time. Flagged now, not yet resolved.
 */

const STATE_KEY_LAST_UPDATE_ID = 'telegram_last_update_id';

/**
 * Retrieve the last processed update_id from persistent DB state.
 *
 * @returns {Promise<number>}
 */
async function getLastUpdateId() {
  try {
    const record = await BotState.findOne({ key: STATE_KEY_LAST_UPDATE_ID }).lean();
    return (record && typeof record.value === 'number') ? record.value : 0;
  } catch (err) {
    console.error(`[Telegram Poller] Failed to load last update_id: ${err.message}`);
    return 0;
  }
}

/**
 * Persist the latest processed update_id to DB so poller restarts resume from next update.
 *
 * @param {number} updateId
 * @returns {Promise<void>}
 */
async function setLastUpdateId(updateId) {
  try {
    await BotState.updateOne(
      { key: STATE_KEY_LAST_UPDATE_ID },
      { $set: { value: updateId, updatedAt: new Date() } },
      { upsert: true }
    );
  } catch (err) {
    console.error(`[Telegram Poller] Failed to save last update_id: ${err.message}`);
  }
}

/**
 * Handle a single Telegram update object.
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

  console.log(`[Telegram Poller] Incoming message from chat ${chatId}: "${text}"`);

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

    console.log(`[Telegram Poller] Link attempt for chat ${chatId} with code "${code}": ${result.success ? 'SUCCESS' : result.reason}`);
    return { action: 'link_attempt', chatId, code, result };
  }

  // 2. Identify user linked to this chat ID
  const user = await User.findOne({ telegramChatId: String(chatId) }).lean();

  if (!user) {
    const unlinkedHelpText = '🤖 You haven\'t linked your Telegram account to an AI News Desk profile yet.\n\nVisit your web dashboard to generate a 6-character linking code, then send:\n`/start <CODE>` here to link.';
    try {
      await sendTelegramMessage(unlinkedHelpText, chatId);
    } catch (err) {
      console.warn(`[Telegram Poller] Could not send unlinked help message to chat ${chatId}: ${err.message}`);
    }
    return { action: 'unlinked_help', chatId };
  }

  // 3. Check for /digest on-demand command
  if (text.toLowerCase() === '/digest') {
    await resendLatestDigest(user, chatId);
    return { action: 'resend_digest', chatId, userId: user.clerkUserId };
  }

  // 4. Conversational chat handling
  console.log(`[Telegram Poller] Processing conversational message from user "${user.clerkUserId}": "${text}"`);
  const reply = await generateChatResponse(user, text);
  try {
    await sendTelegramMessage(reply, chatId);
  } catch (err) {
    console.error(`[Telegram Poller] Failed to send chat reply to chat ${chatId}: ${err.message}`);
  }
  return { action: 'chat_reply', chatId, userId: user.clerkUserId, replyLength: reply.length };
}

/**
 * Fetch updates from Telegram using long-polling.
 *
 * @param {number} offset - Update ID from which updates will be returned (last_id + 1)
 * @param {number} [timeout=25] - Long-poll hold timeout in seconds
 * @returns {Promise<Array<Object>>}
 */
async function fetchTelegramUpdates(offset = 0, timeout = 25) {
  if (!config.TELEGRAM_BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN is not configured');
  }

  const url = `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/getUpdates?offset=${offset}&timeout=${timeout}&allowed_updates=["message"]`;

  try {
    const response = await fetch(url, { method: 'GET' });
    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(`Telegram getUpdates error: ${data.description || response.statusText}`);
    }

    return data.result || [];
  } catch (err) {
    console.error(`[Telegram Poller] Network error fetching updates: ${err.message}`);
    const { captureException } = require('./sentry');
    captureException(err, { tags: { component: 'telegram_poller', action: 'fetch_updates' } });
    return [];
  }
}

/**
 * Run continuous polling loop for Telegram updates.
 *
 * @param {Object} [options]
 * @param {number} [options.timeout=25] - Long-polling timeout (seconds)
 * @param {number} [options.pollDelayMs=500] - Delay between polls (ms)
 * @param {number} [options.maxPolls] - Optional stop condition for tests
 * @param {number} [options.initialOffset] - Explicit initial offset (overrides DB)
 * @param {AbortSignal} [options.signal] - AbortSignal to gracefully stop poller
 * @returns {Promise<void>}
 */
async function startTelegramPoller(options = {}) {
  const timeout = options.timeout ?? 25;
  const pollDelayMs = options.pollDelayMs ?? 500;
  const fetchFn = options.fetchUpdates || fetchTelegramUpdates;
  const processFn = options.processUpdate || processTelegramUpdate;

  // Initialize offset from persistent DB state (last processed update_id + 1)
  let offset = options.initialOffset;
  if (offset === undefined) {
    const lastId = await getLastUpdateId();
    offset = lastId > 0 ? lastId + 1 : 0;
  }

  let pollCount = 0;
  console.log(`[Telegram Poller] Starting long-poll loop (initial offset: ${offset}, timeout: ${timeout}s, delay: ${pollDelayMs}ms)...`);

  while (!options.signal?.aborted) {
    if (options.maxPolls && pollCount >= options.maxPolls) {
      console.log(`[Telegram Poller] Reached maxPolls limit (${options.maxPolls}). Exiting.`);
      break;
    }

    pollCount++;
    const updates = await fetchFn(offset, timeout);

    for (const update of updates) {
      // Advance offset and persist to DB to acknowledge update
      offset = update.update_id + 1;
      await setLastUpdateId(update.update_id);

      try {
        await processFn(update);
      } catch (err) {
        console.error(`[Telegram Poller] Error processing update ${update.update_id}: ${err.message}`);
        const { captureException } = require('./sentry');
        captureException(err, { tags: { component: 'telegram_poller', update_id: update.update_id } });
      }
    }

    if (pollDelayMs > 0 && !options.signal?.aborted) {
      await new Promise((resolve) => setTimeout(resolve, pollDelayMs));
    }
  }

  console.log('[Telegram Poller] Poller stopped.');
}

module.exports = {
  getLastUpdateId,
  setLastUpdateId,
  processTelegramUpdate,
  fetchTelegramUpdates,
  startTelegramPoller,
};
