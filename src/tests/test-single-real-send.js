const { connectDB, disconnectDB } = require('../db/connect');
const Article = require('../models/Article');
const { formatArticleEntry, sendTelegramMessage } = require('../services/telegram');

async function testRealArticle() {
  await connectDB();
  try {
    const art = await Article.findOne({ isRelevant: true, summary: { $ne: null } })
      .populate('selectedArticleId')
      .lean();

    const entry = `🔵 *Test Real Article*\n\n${formatArticleEntry(art, 1)}`;
    console.log('Sending entry:\n', entry);
    const res = await sendTelegramMessage(entry);
    console.log('Telegram response:', res.ok, 'Msg ID:', res.result?.message_id);
  } finally {
    await disconnectDB();
  }
}

testRealArticle().catch(console.error);
