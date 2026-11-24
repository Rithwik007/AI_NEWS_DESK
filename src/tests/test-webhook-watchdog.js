const { test } = require('node:test');
const assert = require('node:assert/strict');
process.env.MONGODB_URI ||= 'mongodb://127.0.0.1/newsdesk_test';
const config = require('../config');
const { checkTelegramWebhookHealth } = require('../services/webhookWatchdog');

test('Telegram watchdog checks the configured host and path', async (t) => {
  const expectedUrl = 'https://desk.example/api/telegram/webhook';
  const info = { url: expectedUrl, pending_update_count: 0 };
  const originalToken = config.TELEGRAM_BOT_TOKEN;
  config.TELEGRAM_BOT_TOKEN = 'fixture';
  t.after(() => { config.TELEGRAM_BOT_TOKEN = originalToken; });
  t.mock.method(global, 'fetch', async () => ({ ok: true, json: async () => ({ ok: true, result: info }) }));
  assert.equal((await checkTelegramWebhookHealth({ expectedUrl })).healthy, true);
  info.url = 'https://other.example/api/telegram/webhook';
  assert.equal((await checkTelegramWebhookHealth({ expectedUrl })).healthy, false);
  info.url = '';
  assert.equal((await checkTelegramWebhookHealth({ expectedUrl })).healthy, false);
});

test('the scheduler selects the current India edition on a UTC host', () => {
  const { currentEdition } = require('../utils/editionTime');
  assert.equal(currentEdition(new Date('2026-11-24T02:29:59Z')), null);
  const morning = currentEdition(new Date('2026-11-24T08:00:00Z'));
  assert.equal(morning.runType, 'morning');
  assert.equal(morning.scheduledAt.toISOString(), '2026-11-24T02:30:00.000Z');
  assert.equal(currentEdition(new Date('2026-11-24T12:30:00Z')).runType, 'evening');
  assert.equal(currentEdition(new Date('2026-11-24T18:30:00Z')), null);
});

test('waking after a completed edition skips it', async t => {
  const PipelineRun = require('../models/PipelineRun');
  const pipeline = require('../pipeline/fetchAndDedup');
  const lookup = t.mock.method(PipelineRun, 'exists', async () => ({ _id: 'recorded' }));
  const run = t.mock.method(pipeline, 'fetchAndDedup', async () => {});
  const { checkCurrentEdition } = require('../services/scheduler');
  const noon = new Date('2026-11-24T06:30:00Z');
  await checkCurrentEdition(noon);
  assert.equal(run.mock.callCount(), 0);
  lookup.mock.mockImplementation(async () => null);
  await checkCurrentEdition(noon);
  assert.deepEqual(run.mock.calls[0].arguments, [{ runType: 'morning' }]);
});
