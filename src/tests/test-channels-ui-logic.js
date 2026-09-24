require('dotenv').config();
const assert = require('assert');
const { createApp } = require('../api/app');
const { connectDB, disconnectDB } = require('../db/connect');
const User = require('../models/User');
const config = require('../config');

// Replicate frontend helpers to test their correctness
const COUNTRY_CODES = [
  { code: '+91', label: '🇮🇳 India (+91)' },
  { code: '+1', label: '🇺🇸/🇨🇦 USA/Canada (+1)' },
  { code: '+44', label: '🇬🇧 UK (+44)' },
  { code: '+971', label: '🇦🇪 UAE (+971)' },
  { code: '+65', label: '🇸🇬 Singapore (+65)' },
  { code: '+61', label: '🇦🇺 Australia (+61)' },
  { code: '+49', label: '🇩🇪 Germany (+49)' },
  { code: '+33', label: '🇫🇷 France (+33)' },
  { code: '+81', label: '🇯🇵 Japan (+81)' },
];

function maskPhoneNumber(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length <= 3) return phone;
  const last3 = digits.slice(-3);
  const bullets = '•'.repeat(Math.max(6, digits.length - 3));
  return `${bullets}${last3}`;
}

function parsePhoneNumber(fullPhone) {
  if (!fullPhone) return { countryCode: '+91', nationalNumber: '' };
  const str = String(fullPhone).trim();
  const sorted = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length);
  for (const item of sorted) {
    if (str.startsWith(item.code)) {
      return { countryCode: item.code, nationalNumber: str.slice(item.code.length).trim() };
    }
  }
  if (str.startsWith('+')) {
    return { countryCode: str.slice(0, 3), nationalNumber: str.slice(3).trim() };
  }
  return { countryCode: '+91', nationalNumber: str };
}

async function runTests() {
  console.log('=== TESTING DELIVERY CHANNELS UI & API LOGIC ===\n');

  // Test Part C: Masking
  console.log('[Part C] Testing maskPhoneNumber...');
  const masked1 = maskPhoneNumber('+917013560134');
  console.log('+917013560134 masked:', masked1);
  assert.strictEqual(masked1.slice(-3), '134');
  assert.ok(masked1.includes('•••••'));

  const masked2 = maskPhoneNumber('+14155552671');
  console.log('+14155552671 masked:', masked2);
  assert.strictEqual(masked2.slice(-3), '671');
  assert.ok(masked2.includes('•••••'));
  console.log('✓ Part C masking tests passed.\n');

  // Test Part B: Parsing & Concatenation
  console.log('[Part B] Testing parsePhoneNumber and two-part formatting...');
  const p1 = parsePhoneNumber('+917013560134');
  assert.strictEqual(p1.countryCode, '+91');
  assert.strictEqual(p1.nationalNumber, '7013560134');

  const p2 = parsePhoneNumber('+971501234567');
  assert.strictEqual(p2.countryCode, '+971');
  assert.strictEqual(p2.nationalNumber, '501234567');

  const p3 = parsePhoneNumber('+14155552671');
  assert.strictEqual(p3.countryCode, '+1');
  assert.strictEqual(p3.nationalNumber, '4155552671');

  // Concatenate back
  const recombined = `${p1.countryCode}${p1.nationalNumber.replace(/\\D/g, '')}`;
  assert.strictEqual(recombined, '+917013560134');
  console.log('✓ Part B parsing & concatenation tests passed.\n');

  // Test Part A: Backend API response messaging
  console.log('[Part A] Testing backend API registration response messaging...');
  await connectDB();
  const app = createApp();
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  const TEST_USER = 'user_test_channels_ui_' + Date.now();

  try {
    // 1. Get Clerk token
    const sRes = await fetch('https://api.clerk.com/v1/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.CLERK_SECRET_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: 'user_3JEbz6SSqzGyAWyPDFRx7wvePp1' }),
    });
    const session = await sRes.json();
    const tRes = await fetch(`https://api.clerk.com/v1/sessions/${session.id}/tokens`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.CLERK_SECRET_KEY}`, 'Content-Type': 'application/json' },
    });
    const { jwt } = await tRes.json();

    // Test Eligible number submission
    console.log('Submitting eligible allowlist number (+917013560134)...');
    const eligibleRes = await fetch(`${baseUrl}/api/whatsapp/register-number`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: '+917013560134' }),
    });
    const eligibleData = await eligibleRes.json();
    console.log('Eligible response:', eligibleData);
    assert.strictEqual(eligibleData.success, true);
    assert.strictEqual(eligibleData.isWhatsAppEligible, true);
    assert.ok(eligibleData.message.includes("You're on the list! WhatsApp delivery is now active."));
    console.log('✓ Eligible outcome messaging verified.\n');

    // Test Non-eligible number submission (using temporary user to avoid duplicate key error)
    await User.create({ clerkUserId: TEST_USER });
    const sRes2 = await fetch('https://api.clerk.com/v1/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.CLERK_SECRET_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: 'user_3JEiVTkaMiLMxjxLMFeqJkv3FO8' }),
    });
    const session2 = await sRes2.json();
    const tRes2 = await fetch(`https://api.clerk.com/v1/sessions/${session2.id}/tokens`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.CLERK_SECRET_KEY}`, 'Content-Type': 'application/json' },
    });
    const { jwt: jwt2 } = await tRes2.json();

    console.log('Submitting non-eligible number (+917893424312)...');
    const ineligibleRes = await fetch(`${baseUrl}/api/whatsapp/register-number`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt2}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: '+917893424312' }),
    });
    const ineligibleData = await ineligibleRes.json();
    console.log('Ineligible response:', ineligibleData);
    assert.strictEqual(ineligibleData.success, true);
    assert.strictEqual(ineligibleData.isWhatsAppEligible, false);
    assert.ok(ineligibleData.message.includes("This number isn't on the current invite list. You're all set on Telegram — no changes needed."));
    console.log('✓ Non-eligible outcome messaging verified.\n');

    console.log('==================================================');
    console.log('ALL DELIVERY CHANNELS LOGIC & API TESTS PASSED! ✓');
    console.log('==================================================\n');
  } finally {
    server.close();
    await User.deleteOne({ clerkUserId: TEST_USER });
    await disconnectDB();
  }
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
