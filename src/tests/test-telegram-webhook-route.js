const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const express = require('express');
process.env.MONGODB_URI ||= 'mongodb://127.0.0.1/newsdesk_test';
const config = require('../config');

test('delivery endpoints validate provider credentials before accepting updates', async (t) => {
  const app = express();
  app.use(express.json({ verify(req, res, bytes) { req.rawBody = bytes; } }));
  app.use('/telegram', require('../routes/telegram'));
  app.use('/whatsapp', require('../routes/whatsapp'));
  app.use('/pipeline', require('../routes/pipeline'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const post = (path, headers = {}) => fetch(origin + path, {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: '{}',
  });
  config.TELEGRAM_WEBHOOK_SECRET = null;
  assert.equal((await post('/telegram/webhook')).status, 403);
  config.TELEGRAM_WEBHOOK_SECRET = 'fixture';
  assert.equal((await post('/telegram/webhook', { 'x-telegram-bot-api-secret-token': 'fixture' })).status, 200);
  process.env.WHATSAPP_APP_SECRET = 'fixture';
  assert.equal((await post('/whatsapp/webhook')).status, 403);
  const signature = createHmac('sha256', 'fixture').update('{}').digest('hex');
  assert.equal((await post('/whatsapp/webhook', { 'x-hub-signature-256': 'sha256=' + signature })).status, 200);
  assert.equal((await fetch(origin + '/whatsapp/recent-logs')).status, 404);
  delete process.env.PIPELINE_SECRET;
  assert.equal((await post('/pipeline/trigger')).status, 401);
});
