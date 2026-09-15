/**
 * Register visible bot commands in the Telegram "/" menu via setMyCommands API.
 * Run once at startup (called from startAll.js) or manually:
 *   node src/scripts/registerBotCommands.js
 *
 * Commands registered:
 *   /start  - Link your Telegram account to AI News Desk
 *   /digest - Resend your latest digest
 */

const path = require('path');
// Support running as standalone script or being required
const configPath = path.join(__dirname, '../config');
const config = require(configPath);

async function registerBotCommands() {
  if (!config.TELEGRAM_BOT_TOKEN) {
    console.warn('[BotCommands] TELEGRAM_BOT_TOKEN not set — skipping command registration.');
    return false;
  }

  const commands = [
    { command: 'start', description: 'Link your Telegram account to AI News Desk' },
    { command: 'digest', description: 'Resend your latest AI news digest' },
  ];

  const url = `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/setMyCommands`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commands }),
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      console.error(`[BotCommands] setMyCommands failed: ${data.description || response.statusText}`);
      return false;
    }

    console.log(`[BotCommands] ✓ Registered ${commands.length} bot commands: ${commands.map((c) => '/' + c.command).join(', ')}`);
    return true;
  } catch (err) {
    console.error(`[BotCommands] Network error during setMyCommands: ${err.message}`);
    return false;
  }
}

module.exports = { registerBotCommands };

// Allow direct execution: node src/scripts/registerBotCommands.js
if (require.main === module) {
  const dotenv = require('dotenv');
  dotenv.config({ path: path.join(__dirname, '../../.env') });
  registerBotCommands()
    .then((ok) => process.exit(ok ? 0 : 1))
    .catch((err) => { console.error(err); process.exit(1); });
}
