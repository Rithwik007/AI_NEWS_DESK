const config = require('../config');
const ChatMessage = require('../models/ChatMessage');
const Article = require('../models/Article');
const ArticleRelevance = require('../models/ArticleRelevance');
const { sendTelegramMessage, formatArticleEntry } = require('./telegram');
const groqRotator = require('./groqRotator');

/**
 * Fetch recent chat history for a user, sorted in chronological order.
 *
 * @param {string} userId - clerkUserId
 * @param {number} [limit=20] - Max messages to retrieve
 * @param {string} [excludeMessageId] - Optional message ID to omit from history
 * @returns {Promise<Array<{ role: string, content: string }>>}
 */
async function getRecentChatHistory(userId, limit = config.CHAT_HISTORY_LIMIT || 20, excludeMessageId = null) {
  const query = { userId };
  if (excludeMessageId) {
    query._id = { $ne: excludeMessageId };
  }

  const messages = await ChatMessage.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  // Reverse to chronological order (oldest first)
  return messages.reverse().map((m) => ({
    role: m.role,
    content: m.content,
  }));
}

/**
 * Fetch a compact text summary of the user's recently delivered digest articles.
 *
 * @param {string} userId - clerkUserId
 * @param {number} [hours=48] - Lookback window in hours
 * @returns {Promise<string>} Formatted digest context
 */
async function getRecentDigestArticles(userId, hours = 48) {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

  let rels = await ArticleRelevance.find({
    userId,
    deliveryStatus: 'delivered',
    deliveredAt: { $gte: cutoff },
  })
    .populate({
      path: 'articleId',
      populate: { path: 'selectedArticleId' },
    })
    .sort({ deliveredAt: -1 })
    .limit(10)
    .lean();

  // If no delivered articles within hours window, fallback to latest delivered batch
  if (rels.length === 0) {
    const latest = await ArticleRelevance.findOne({
      userId,
      deliveryStatus: 'delivered',
    })
      .sort({ deliveredAt: -1 })
      .lean();

    if (latest && latest.deliveredAt) {
      const batchWindow = new Date(latest.deliveredAt.getTime() - 10 * 60 * 1000);
      rels = await ArticleRelevance.find({
        userId,
        deliveryStatus: 'delivered',
        deliveredAt: { $gte: batchWindow, $lte: latest.deliveredAt },
      })
        .populate({
          path: 'articleId',
          populate: { path: 'selectedArticleId' },
        })
        .sort({ rankingScore: -1 })
        .limit(5)
        .lean();
    }
  }

  if (rels.length === 0) {
    return 'No recent digest articles available.';
  }

  return rels
    .map((r, i) => {
      const art = r.articleId;
      if (!art) return null;
      const target = art.selectedArticleId || art;
      const title = target.title || art.title || 'Untitled';
      const source = target.source || art.source || 'Unknown';
      const summary = art.summary || target.snippet || '';
      const whyReadThis = art.whyReadThis || '';
      const url = target.url || art.url || '';

      return `[Article ${i + 1}]
Title: "${title}"
Source: ${source}
Summary: ${summary}
Why it matters: ${whyReadThis}
URL: ${url}`;
    })
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Handle conversational user message via Groq with digest context injection and multi-key rotation.
 *
 * @param {Object} user - User document { clerkUserId, telegramChatId }
 * @param {string} userText - Incoming user text
 * @returns {Promise<string>} Assistant reply text
 */
async function generateChatResponse(user, userText) {
  const userId = user.clerkUserId;
  const chatId = user.telegramChatId;

  // 1. Persist user message to ChatMessage collection
  const userMsgDoc = await ChatMessage.create({
    userId,
    telegramChatId: String(chatId),
    role: 'user',
    content: userText,
  });

  // 2. Retrieve conversation history & recent digest context
  const history = await getRecentChatHistory(userId, config.CHAT_HISTORY_LIMIT, userMsgDoc._id);
  const digestContext = await getRecentDigestArticles(userId, 48);

  // 3. Construct prompt
  const systemPrompt = `You are a knowledgeable, concise, and helpful personal AI assistant for this user's AI news bot.
You have access to the user's recently delivered digest articles (provided below).

--- RECENT DIGEST ARTICLES ---
${digestContext}
------------------------------

INSTRUCTIONS:
1. If the user's question relates to one of the provided digest articles, use the factual details from the article (title, publication outlet, summary, why it matters) to give an insightful, accurate answer.
2. If the user's question does NOT relate to the digest articles, answer normally as a helpful assistant using your general knowledge. Do NOT force connections to AI news or the digest if the user is asking about an unrelated topic (e.g. general trivia, coding help, other news).
3. Keep answers clear, conversational, and direct for mobile Telegram reading. Avoid unnecessary preamble.`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: userText },
  ];

  // 4. Call Groq API via key rotator (handles 429 failover automatically across key pool)
  let assistantReply = '';
  try {
    const groqModel = config.GROQ_CHAT_MODEL || config.GROQ_MODEL || 'openai/gpt-oss-20b';
    const data = await groqRotator.callChatCompletion({
      model: groqModel,
      messages,
      temperature: 0.5,
      max_tokens: 1024,
    });

    if (!data.choices?.[0]?.message?.content) {
      throw new Error('Groq returned empty response');
    }

    assistantReply = data.choices[0].message.content.trim();
  } catch (err) {
    console.error(`[Chat] Groq API error: ${err.message}`);
    assistantReply = "I'm having trouble connecting to the inference engine right now. Please try again in a moment.";
  }

  // 5. Persist assistant reply
  await ChatMessage.create({
    userId,
    telegramChatId: String(chatId),
    role: 'assistant',
    content: assistantReply,
  });

  return assistantReply;
}

/**
 * Resend the user's most recently delivered digest on demand.
 *
 * @param {Object} user - User document
 * @param {string|number} chatId - Telegram chat ID
 * @returns {Promise<boolean>} Success status
 */
async function resendLatestDigest(user, chatId) {
  const userId = user.clerkUserId;

  const latestRel = await ArticleRelevance.findOne({
    userId,
    deliveryStatus: 'delivered',
  })
    .sort({ deliveredAt: -1 })
    .lean();

  if (!latestRel || !latestRel.deliveredAt) {
    const emptyMsg = "📭 You haven't received any digests yet! Your first digest will arrive during the scheduled morning (8:00 AM IST) or evening (6:00 PM IST) runs.";
    await sendTelegramMessage(emptyMsg, chatId);
    return false;
  }

  // Find articles delivered within the same 10-minute window
  const batchStart = new Date(latestRel.deliveredAt.getTime() - 10 * 60 * 1000);
  const deliveredRels = await ArticleRelevance.find({
    userId,
    deliveryStatus: 'delivered',
    deliveredAt: { $gte: batchStart, $lte: latestRel.deliveredAt },
  })
    .populate({
      path: 'articleId',
      populate: { path: 'selectedArticleId' },
    })
    .sort({ rankingScore: -1 })
    .limit(5)
    .lean();

  if (deliveredRels.length === 0) {
    const emptyMsg = "📭 Could not retrieve your recent digest articles. Please check back after the next scheduled delivery.";
    await sendTelegramMessage(emptyMsg, chatId);
    return false;
  }

  const selectedArticles = deliveredRels.map((r) => ({
    ...r.articleId,
    _id: r.articleId._id,
    relevanceId: r._id,
    rankingScore: r.rankingScore,
    confidenceTier: r.confidenceTier,
    matchedTopic: r.matchedTopic,
  }));

  const header = `📰 *Your Latest AI News Digest*\n\n`;
  const entries = selectedArticles.map((a, i) => formatArticleEntry(a, i + 1)).join('');
  let messageText = `${header}${entries}`.trim();

  // Telegram character limit protection (4096 chars)
  if (messageText.length > 4000) {
    messageText = messageText.slice(0, 3990) + '...';
  }

  await sendTelegramMessage(messageText, chatId);
  console.log(`[Chat] Resent latest digest to user "${userId}" (${selectedArticles.length} articles).`);
  return true;
}

/**
 * Prune ChatMessage records older than specified retention window (default 30 days).
 *
 * @param {number} [maxAgeDays=30]
 * @returns {Promise<number>} Number of pruned records
 */
async function pruneOldChatMessages(maxAgeDays = config.CHAT_PRUNE_DAYS || 30) {
  const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);
  const result = await ChatMessage.deleteMany({ createdAt: { $lt: cutoff } });
  console.log(`[Chat] Pruned ${result.deletedCount || 0} chat messages older than ${maxAgeDays} days (cutoff: ${cutoff.toISOString()}).`);
  return result.deletedCount || 0;
}

module.exports = {
  getRecentChatHistory,
  getRecentDigestArticles,
  generateChatResponse,
  resendLatestDigest,
  pruneOldChatMessages,
};
