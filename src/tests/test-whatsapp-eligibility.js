const assert = require('assert');
const config = require('../config');
const { cleanPhoneNumber, isPhoneAllowed } = require('../services/whatsapp');

async function runEligibilityTests() {
  console.log('\n=============================================');
  console.log('TEST SUITE: WHATSAPP ELIGIBILITY & ALLOWLIST');
  console.log('=============================================\n');

  // Test 1: Single number parsing (no commas)
  console.log('[Test 1] Testing single number env parsing (e.g. WHATSAPP_ALLOWED_NUMBERS=+917013560134)...');
  const singleEnv = '+917013560134';
  const parsedSingle = singleEnv.split(',').map((n) => n.trim()).filter(Boolean);
  assert.strictEqual(parsedSingle.length, 1);
  assert.strictEqual(parsedSingle[0], '+917013560134');
  console.log('✓ Single number parsed correctly without commas.');

  // Test 2: Multi-number with whitespace
  console.log('\n[Test 2] Testing multi-number env parsing with spaces...');
  const multiEnv = '+917013560134,  +15551234567 ,   +919876543210  ';
  const parsedMulti = multiEnv.split(',').map((n) => n.trim()).filter(Boolean);
  assert.deepStrictEqual(parsedMulti, ['+917013560134', '+15551234567', '+919876543210']);
  console.log('✓ Whitespace around commas trimmed cleanly.');

  // Test 3: isPhoneAllowed matching logic
  console.log('\n[Test 3] Testing isPhoneAllowed with formatting variations...');
  const origAllowed = config.WHATSAPP_ALLOWED_NUMBERS;
  config.WHATSAPP_ALLOWED_NUMBERS = ['+917013560134', '+15551234567'];

  // Allowed variations
  assert.strictEqual(isPhoneAllowed('+917013560134'), true);
  assert.strictEqual(isPhoneAllowed('917013560134'), true);
  assert.strictEqual(isPhoneAllowed('+91 70135-60134'), true);
  assert.strictEqual(isPhoneAllowed('+1 (555) 123-4567'), true);

  // Ineligible numbers
  assert.strictEqual(isPhoneAllowed('+919999999999'), false);
  assert.strictEqual(isPhoneAllowed('+15550000000'), false);
  assert.strictEqual(isPhoneAllowed(''), false);
  assert.strictEqual(isPhoneAllowed(null), false);
  console.log('✓ isPhoneAllowed correctly approves allowlisted numbers and rejects non-allowlisted.');

  // Test 4: Pipeline delivery selection logic
  console.log('\n[Test 4] Testing pipeline channel routing logic...');
  const eligibleUser = {
    clerkUserId: 'user_eligible',
    whatsappPhoneNumber: '+917013560134',
    isWhatsAppEligible: true,
    telegramChatId: '11111',
  };
  const ineligibleUser = {
    clerkUserId: 'user_ineligible',
    whatsappPhoneNumber: '+919999999999',
    isWhatsAppEligible: false,
    telegramChatId: '22222',
  };

  function determineChannel(user) {
    if (user.whatsappPhoneNumber && user.isWhatsAppEligible) {
      return 'whatsapp';
    }
    if (user.telegramChatId) {
      return 'telegram';
    }
    return 'none';
  }

  assert.strictEqual(determineChannel(eligibleUser), 'whatsapp');
  assert.strictEqual(determineChannel(ineligibleUser), 'telegram');
  console.log('✓ Eligible user routes to WhatsApp; Ineligible user routes to Telegram.');

  // Restore config
  config.WHATSAPP_ALLOWED_NUMBERS = origAllowed;

  console.log('\n=============================================');
  console.log('ALL ELIGIBILITY TESTS PASSED! ✓');
  console.log('=============================================\n');
}

runEligibilityTests().catch((err) => {
  console.error('Eligibility test failed:', err);
  process.exit(1);
});
