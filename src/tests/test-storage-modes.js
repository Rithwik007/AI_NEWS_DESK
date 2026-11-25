const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');

// Mongo parity runs opt in with an isolated localhost test database.
const mongoUri = process.env.DESK_TEST_MONGO;
if (mongoUri && !/^mongodb:\/\/127\.0\.0\.1:\d+\/desk_test_[a-z0-9_]+$/i.test(mongoUri)) throw new Error('Use an isolated local test database');
process.env.AUTH_MODE = process.env.DESK_TEST_AUTH || 'none';
process.env.DATABASE_MODE = mongoUri ? 'mongodb' : 'sqlite';
process.env.MONGODB_URI = mongoUri || '';
process.env.SQLITE_PATH = path.join(mkdtempSync(path.join(tmpdir(), 'desk-test-')), 'test.sqlite');
process.env.CLERK_PUBLISHABLE_KEY = 'pk_test_' + Buffer.from('desk.clerk.accounts.dev$').toString('base64');
process.env.CLERK_SECRET_KEY = 'sk_test_fixture';
process.env.TELEGRAM_BOT_TOKEN = 'fixture';

test('desk storage, reader identity and Telegram linking', async t => {
  const { connectDB, disconnectDB } = require('../db/connect');
  await connectDB();
  t.after(disconnectDB);
  const User = require('../models/User');
  const Profile = require('../models/InterestProfile');
  const Article = require('../models/Article');
  const Rel = require('../models/ArticleRelevance');
  const Run = require('../models/PipelineRun');
  const Chat = require('../models/ChatMessage');
  await Promise.all([User, Profile, Article, Rel, Run, Chat].map(m => m.init()));
  const { generateTelegramLinkCode, verifyAndLinkTelegramCode } = require('../services/telegramAuth');
  const { code } = await generateTelegramLinkCode('reader-a');
  assert.ok((await verifyAndLinkTelegramCode(code, '123')).success);
  assert.equal((await verifyAndLinkTelegramCode(code, '456')).success, false);
  await Profile.findOneAndUpdate({ userId: 'reader-a' }, { $set: { topics: [{ topic: 'Robotics', weight: 1, embedding: [0.5] }] } }, { upsert: true });
  assert.equal((await Profile.findOne({ userId: 'reader-a' }).lean()).topics[0].topic, 'Robotics');
  assert.equal(await Profile.findOne({ userId: 'reader-b' }), null);
  const source = { title: 'Story', source: 'Example', publishedAt: new Date(), url: 'https://example.org/story' };
  const [article] = await Article.insertMany([source]);
  await assert.rejects(Article.create(source), { code: 11000 });
  await Rel.bulkWrite([{ updateOne: { filter: { userId: 'reader-a', articleId: article._id }, update: { $set: { isRelevant: true } }, upsert: true } }]);
  assert.deepEqual((await Rel.distinct('articleId', { isRelevant: true })).map(String), [String(article._id)]);
  assert.equal((await Rel.find({ articleId: { $in: [article._id] } }).populate('articleId').lean())[0].articleId.title, 'Story');
  await Rel.updateMany({ deliveryStatus: { $nin: ['delivered'] } }, { $set: { deliveryStatus: 'delivered' } });
  assert.ok(await Rel.exists({ deliveryStatus: 'delivered' }));
  await Run.create({ runType: 'morning' });
  assert.ok(await Run.exists({ completedAt: { $gte: new Date(0) } }));
  await Chat.create({ userId: 'reader-a', telegramChatId: '123', role: 'user', content: 'hi' });
  assert.equal((await Chat.deleteMany({ createdAt: { $lte: new Date() } })).deletedCount, 1);
  if (!mongoUri) {
    await disconnectDB();
    await connectDB();
    assert.equal((await User.findOne({ clerkUserId: 'reader-a' })).telegramChatId, '123');
  }

  if (process.env.AUTH_MODE === 'none') {
    const pending = await generateTelegramLinkCode('poll-reader');
    const controller = new AbortController();
    const offsets = [];
    let reply;
    const api = t.mock.method(global, 'fetch', async (url, request) => {
      const body = JSON.parse(request.body);
      if (url.endsWith('/sendMessage')) {
        reply = body;
        return Response.json({ ok: true, result: { message_id: 1 } });
      }
      offsets.push(body.offset);
      if (body.offset === 43) controller.abort();
      return Response.json({ ok: true, result: body.offset ? [] : [{
        update_id: 42, message: { text: '/start ' + pending.code, chat: { id: 456, type: 'private' } },
      }] });
    });
    try {
      await require('../services/telegramPolling').pollTelegram(AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]));
    } finally {
      api.mock.restore();
    }
    assert.deepEqual(offsets, [0, 43]);
    assert.equal(reply.chat_id, 456);
    assert.equal((await User.findOne({ clerkUserId: 'poll-reader' })).telegramChatId, '456');
  }

  const schedules = ['morning', 'evening', 'both'];
  for (const digestSchedule of schedules) {
    await User.create({ clerkUserId: digestSchedule, telegramChatId: digestSchedule, digestSchedule });
    await Rel.create({ userId: digestSchedule, articleId: article._id, isRelevant: true, confidenceTier: 'high' });
  }
  await User.updateOne({ clerkUserId: 'reader-a' }, { $unset: { digestSchedule: '' } });
  await Article.updateOne({ _id: article._id }, { $set: { summary: 'Story summary', whyReadThis: 'Context', fetchedAt: new Date(Date.now() - 3600000) } });
  const { deliverToTelegram } = require('../services/telegram');
  for (const runType of ['morning', 'evening']) {
    const result = await deliverToTelegram({ runType, dryRun: true });
    const ids = result.userResults.map(row => row.userId);
    assert.ok(ids.includes('both') && ids.includes('reader-a'));
    assert.equal(ids.includes('morning'), runType === 'morning');
    assert.equal(ids.includes('evening'), runType === 'evening');
    assert.equal(result.userResults.find(r => r.userId === runType).deliveredCount, 1);
  }

  const server = require('../api/app').createApp().listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port;
  const headers = { 'X-Desk-Local': '1' };
  const sync = () => fetch(base + '/api/auth/sync', { method: 'POST', headers });
  if (process.env.AUTH_MODE === 'none') {
    assert.equal((await sync()).status, 201);
    assert.equal((await sync()).status, 200);
    assert.equal((await (await fetch(base + '/api/auth/me', { headers })).json()).user.clerkUserId, 'local-reader');
    const schedule = digestSchedule => fetch(base + '/api/auth/schedule', {
      method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ digestSchedule }),
    });
    assert.equal((await schedule('weekly')).status, 400);
    for (const value of schedules) {
      assert.equal((await schedule(value)).status, 200);
      const profile = await (await fetch(base + '/api/auth/me', { headers })).json();
      assert.equal(profile.user.digestSchedule, value);
    }
    assert.equal((await fetch(base + '/api/auth/me')).status, 403);
    assert.equal((await fetch(base + '/api/auth/me', { headers: { ...headers, origin: 'https://example.org' } })).status, 403);
  } else {
    assert.equal((await sync()).status, 401);
  }
});
