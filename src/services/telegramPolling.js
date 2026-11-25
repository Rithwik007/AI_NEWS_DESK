const { setTimeout: delay } = require('node:timers/promises');
const config = require('../config');
const { processTelegramUpdate } = require('./telegramWebhook');

// A dedicated local bot receives updates over outbound HTTPS without a public tunnel.
async function pollTelegram(signal) {
  let offset = 0;
  while (!signal.aborted) {
    try {
      const response = await fetch(`https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/getUpdates`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offset, timeout: 25, allowed_updates: ['message'] }),
        signal: AbortSignal.any([signal, AbortSignal.timeout(35000)]),
      });
      if (!response.ok) throw new Error(response.status === 409 ? 'This bot already has a webhook or another poller. Use a dedicated bot.' : 'Telegram HTTP ' + response.status);
      const data = await response.json();
      if (!data.ok || !Array.isArray(data.result)) throw new Error('Invalid Telegram response');
      for (const update of data.result) {
        if (signal.aborted) return;
        await processTelegramUpdate(update);
        offset = update.update_id + 1;
      }
    } catch (err) {
      if (signal.aborted) return;
      console.warn('[Telegram polling]', err.message);
      await delay(5000, undefined, { signal }).catch(() => {});
    }
  }
}
module.exports = { pollTelegram };
