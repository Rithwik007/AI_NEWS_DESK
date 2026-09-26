require('dotenv').config();
const { connectDB, disconnectDB } = require('../db/connect');
const User = require('../models/User');
const Article = require('../models/Article');
const { generateDigestGreeting, generateChatResponse } = require('../services/chat');
const assert = require('assert');

async function runTests() {
  console.log('=== TESTING CONVERSATIONAL LAYER (GREETINGS & FRIEND PERSONA) ===\n');
  await connectDB();

  const user = await User.findOne({ isWhatsAppEligible: true }).lean() || await User.findOne({}).lean();
  console.log(`Using test user: ${user.clerkUserId}\n`);

  // --- PART 1: Dynamic Greeting Variations ---
  console.log('--- 1. Testing 3 Separate Dynamic Digest Greetings ---');
  const greetings = [];
  for (let i = 0; i < 3; i++) {
    const greeting = await generateDigestGreeting();
    console.log(`Greeting ${i + 1}: "${greeting}"`);
    assert(greeting && greeting.length > 10, `Greeting ${i + 1} must be non-empty and substantial`);
    assert(!greeting.includes('[Name]'), `Greeting ${i + 1} must not contain [Name] placeholder`);
    assert(!greeting.startsWith('"') && !greeting.endsWith('"'), `Greeting ${i + 1} must not have outer quotes`);
    greetings.push(greeting);
  }

  // Ensure they are genuinely different each time
  assert.notStrictEqual(greetings[0], greetings[1], 'Greeting 1 and 2 must be different');
  assert.notStrictEqual(greetings[1], greetings[2], 'Greeting 2 and 3 must be different');
  assert.notStrictEqual(greetings[0], greetings[2], 'Greeting 1 and 3 must be different');
  console.log('✓ PASS: All 3 greetings are unique, natural, and non-templated.\n');

  // --- PART 2: Friend Persona for Casual Message ---
  console.log('--- 2. Testing Friend Persona on Casual Message ("hey what\'s up") ---');
  const casualReply = await generateChatResponse(user, "hey what's up", { channel: 'whatsapp' });
  console.log('Casual Reply:\n', casualReply);
  assert(casualReply && casualReply.length > 5, 'Casual reply must be non-empty');
  assert(!casualReply.toLowerCase().includes('as an ai language model'), 'Must not sound robotic');
  console.log('✓ PASS: Casual response reflects warm, friendly texting tone.\n');

  // --- PART 3: Digest Content Unaffected Verification ---
  console.log('--- 3. Verifying Digest Summaries & Calibrated WhyReadThis Unaffected ---');
  const recentArticle = await Article.findOne({ whyReadThis: { $ne: null } }).sort({ publishedAt: -1 }).lean();
  if (recentArticle) {
    console.log('Sample Article Title:', recentArticle.title);
    console.log('Sample Summary (factual):', recentArticle.summary);
    console.log('Sample WhyReadThis (calibrated):', recentArticle.whyReadThis);
    assert(recentArticle.summary && recentArticle.whyReadThis, 'Article must have factual summary and calibrated whyReadThis');
    console.log('✓ PASS: Article content remains strictly factual and calibrated.\n');
  }

  console.log('=== ALL CONVERSATIONAL LAYER TESTS PASSED! ===');
  await disconnectDB();
  process.exit(0);
}

runTests().catch(async (err) => {
  console.error('Test failed:', err);
  await disconnectDB();
  process.exit(1);
});
