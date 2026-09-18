require('dotenv').config();
const config = require('../config');

/**
 * Script to register or inspect the Telegram webhook.
 * Usage:
 *   node src/scripts/setTelegramWebhook.js          # Register webhook
 *   node src/scripts/setTelegramWebhook.js --info   # Check current status
 *   node src/scripts/setTelegramWebhook.js --delete # Delete webhook
 */
async function main() {
  if (!config.TELEGRAM_BOT_TOKEN) {
    console.error('❌ TELEGRAM_BOT_TOKEN is missing in environment.');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const isInfoOnly = args.includes('--info');
  const isDelete = args.includes('--delete');

  const baseUrl = `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}`;

  if (isDelete) {
    console.log('[Telegram Webhook] Deleting webhook...');
    const delRes = await fetch(`${baseUrl}/deleteWebhook?drop_pending_updates=false`);
    const delData = await delRes.json();
    console.log('[Telegram Webhook] deleteWebhook response:', delData);
    return;
  }

  if (isInfoOnly) {
    console.log('[Telegram Webhook] Fetching webhook info...');
    const infoRes = await fetch(`${baseUrl}/getWebhookInfo`);
    const infoData = await infoRes.json();
    console.log('[Telegram Webhook] getWebhookInfo result:', JSON.stringify(infoData, null, 2));
    return;
  }

  const defaultWebhookUrl = 'https://ai-news-backend-rmdj.onrender.com/api/telegram/webhook';
  const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL || defaultWebhookUrl;

  console.log(`[Telegram Webhook] Registering webhook to: ${webhookUrl}`);
  if (config.TELEGRAM_WEBHOOK_SECRET) {
    console.log('[Telegram Webhook] Including X-Telegram-Bot-Api-Secret-Token protection.');
  } else {
    console.log('[Telegram Webhook] No TELEGRAM_WEBHOOK_SECRET set; registering without secret token.');
  }

  const body = {
    url: webhookUrl,
    allowed_updates: ['message'],
  };

  if (config.TELEGRAM_WEBHOOK_SECRET) {
    body.secret_token = config.TELEGRAM_WEBHOOK_SECRET;
  }

  const setRes = await fetch(`${baseUrl}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const setData = await setRes.json();
  console.log('[Telegram Webhook] setWebhook response:', JSON.stringify(setData, null, 2));

  if (!setData.ok) {
    console.error('❌ Failed to set webhook:', setData.description);
    process.exit(1);
  }

  // Verify registration immediately with getWebhookInfo
  console.log('\n[Telegram Webhook] Verifying with getWebhookInfo...');
  const verifyRes = await fetch(`${baseUrl}/getWebhookInfo`);
  const verifyData = await verifyRes.json();
  console.log('[Telegram Webhook] Current Webhook Info:');
  console.log(JSON.stringify(verifyData.result, null, 2));
}

main().catch((err) => {
  console.error('Error managing Telegram webhook:', err);
  process.exit(1);
});
