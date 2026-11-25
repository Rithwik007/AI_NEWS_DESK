const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
process.env.MONGODB_URI = 'mongodb://127.0.0.1/newsdesk_test';
process.env.CLERK_PUBLISHABLE_KEY = 'pk_test_' + Buffer.from('desk.clerk.accounts.dev$').toString('base64');
process.env.CLERK_SECRET_KEY = 'sk_test_fixture';
process.env.WHATSAPP_APP_SECRET = 'fixture';

// Load application dependencies before timing the local webhook round trip.
require('../services/chat');
require('@clerk/express');
require('../models/User');
require('../db/connect');

test('WhatsApp stories put the headline and summary before the source link', () => {
  const { formatWhatsAppArticleEntry } = require('../services/whatsapp');
  const article = { title: 'A new model', summary: 'A short finding.', source: 'Example', url: 'https://example.org/story', whyReadThis: 'Private ranking reason' };
  assert.equal(formatWhatsAppArticleEntry(article, 1), '*1. A new model*\nA short finding.\n_Example_\nhttps://example.org/story\n\n');
});

test('an invited unlinked sender gets their own host’s dashboard link', { timeout: 10000 }, async t => {
  const config = require('../config');
  const phone = '15550100101';
  config.WHATSAPP_ALLOWED_NUMBERS = [phone];
  config.FRONTEND_URL = 'https://desk.example';
  t.mock.method(require('../db/connect'), 'ensureDBConnected', async () => {});
  t.mock.method(require('../models/User'), 'findOne', async () => null);
  const { promise, resolve } = Promise.withResolvers();
  t.mock.method(require('../services/whatsapp'), 'sendWhatsAppMessage', async (to, text) => resolve({ to, text }));
  const server = require('../api/app').createApp().listen(0, '127.0.0.1');
  await new Promise(ready => server.once('listening', ready));
  t.after(() => new Promise(done => server.close(done)));
  const body = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ value: { messages: [{ from: phone, type: 'text', text: { body: 'hello' } }] } }] }],
  });
  const digest = createHmac('sha256', 'fixture').update(body).digest('hex');
  const res = await fetch(`http://127.0.0.1:${server.address().port}/api/whatsapp/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=' + digest },
    body,
  });
  assert.equal(res.status, 200);
  const reply = await promise;
  assert.equal(reply.to, phone);
  assert.ok(reply.text.includes(config.FRONTEND_URL));
});
