const config = require('../config');

/**
 * Validates that all required environment variables are set and non-empty at boot.
 * Fails fast with a loud, descriptive error message if any critical variables are missing.
 *
 * @param {Object} [options]
 * @param {boolean} [options.failFast=true]
 * @returns {boolean}
 */
function validateStartupEnv(options = { failFast: true }) {
  const whatsappEnabled = Boolean(config.WHATSAPP_ACCESS_TOKEN || config.WHATSAPP_PHONE_NUMBER_ID || config.WHATSAPP_BUSINESS_ACCOUNT_ID || config.WEBHOOK_VERIFY_TOKEN || process.env.WHATSAPP_APP_SECRET);
  const checks = [
    { name: 'MONGODB_URI', value: config.MONGODB_URI, required: config.DATABASE_MODE === 'mongodb' },
    { name: 'GROQ_API_KEY', value: config.GROQ_API_KEYS?.[0] || config.GROQ_API_KEY, required: true },
    { name: 'TELEGRAM_BOT_TOKEN', value: config.TELEGRAM_BOT_TOKEN, required: true },
    { name: 'CLERK_SECRET_KEY', value: config.CLERK_SECRET_KEY, required: config.AUTH_MODE === 'clerk' },
    { name: 'CLERK_PUBLISHABLE_KEY', value: config.CLERK_PUBLISHABLE_KEY, required: config.AUTH_MODE === 'clerk' },
    { name: 'WEBHOOK_VERIFY_TOKEN', value: config.WEBHOOK_VERIFY_TOKEN, required: whatsappEnabled },
    { name: 'WHATSAPP_ACCESS_TOKEN', value: config.WHATSAPP_ACCESS_TOKEN, required: whatsappEnabled },
    { name: 'WHATSAPP_PHONE_NUMBER_ID', value: config.WHATSAPP_PHONE_NUMBER_ID, required: whatsappEnabled },
    { name: 'WHATSAPP_BUSINESS_ACCOUNT_ID', value: config.WHATSAPP_BUSINESS_ACCOUNT_ID, required: whatsappEnabled },

    { name: 'TELEGRAM_WEBHOOK_SECRET', value: config.TELEGRAM_WEBHOOK_SECRET, required: true },
  ];

  if (whatsappEnabled && !process.env.WHATSAPP_APP_SECRET) {
    console.warn('[WhatsApp] WHATSAPP_APP_SECRET missing. WhatsApp linking and delivery are paused.');
  }

  const missingRequired = checks
    .filter(item => item.required && !String(item.value || '').trim())
    .map(item => item.name);

  if (missingRequired.length > 0) {
    const divider = '='.repeat(72);
    const starLine = '*'.repeat(72);
    const errorBox = [
      divider,
      starLine,
      '  CRITICAL STARTUP ERROR: MISSING REQUIRED ENVIRONMENT VARIABLES',
      starLine,
      'The following mandatory environment variables are missing or empty:',
      ...missingRequired.map((name) => `  ❌ ${name}`),
      '',
      'Please add these variables in your Render Dashboard (or .env file).',
      'The backend is aborting startup to prevent running in a broken state.',
      starLine,
      divider,
    ].join('\n');

    console.error(`\n${errorBox}\n`);

    if (options.failFast) {
      throw new Error(`Missing required environment variables: ${missingRequired.join(', ')}`);
    }
    return false;
  }

  console.log('[Startup] ✓ All required environment variables verified successfully.');
  return true;
}

module.exports = { validateStartupEnv };
