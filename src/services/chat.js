const config = require('../config');
const ChatMessage = require('../models/ChatMessage');
const Article = require('../models/Article');
const ArticleRelevance = require('../models/ArticleRelevance');
const InterestProfile = require('../models/InterestProfile');
const { scoreRelevance, checkSpamKeywords } = require('./relevance');
const telegramService = require('./telegram');
const whatsappService = require('./whatsapp');
const { formatArticleEntry } = telegramService;
const { formatWhatsAppArticleEntry } = whatsappService;
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
 * @param {Object} user - User document { clerkUserId, telegramChatId, whatsappPhoneNumber }
 * @param {string} userText - Incoming user text
 * @param {Object} [options]
 * @param {'telegram'|'whatsapp'} [options.channel='telegram']
 * @param {string|number} [options.senderId]
 * @returns {Promise<string>} Assistant reply text
 */
async function generateChatResponse(user, userText, options = {}) {
  const userId = user.clerkUserId;
  const channel = options.channel || 'telegram';
  const senderId = options.senderId || (channel === 'whatsapp' ? user.whatsappPhoneNumber : user.telegramChatId);

  // 1. Persist user message to ChatMessage collection
  const userMsgDoc = await ChatMessage.create({
    userId,
    telegramChatId: String(senderId || ''),
    role: 'user',
    content: userText,
  });

  // 2. Retrieve conversation history & recent digest context
  const history = await getRecentChatHistory(userId, config.CHAT_HISTORY_LIMIT, userMsgDoc._id);
  const digestContext = await getRecentDigestArticles(userId, 48);

  // 3. Construct prompt with warm, casual friend persona (distinct from factual summary prompts)
  const systemPrompt = `You're chatting with a friend who built this news bot. Be warm, casual, and personable — like texting a friend, not a formal assistant. You can be a little playful.
You have access to the user's recently delivered digest articles (provided below).

--- RECENT DIGEST ARTICLES ---
${digestContext}
------------------------------

INSTRUCTIONS:
1. If the user asks about news, recent events, or topics from their digest, use the factual details from the articles above (title, outlet, summary, why it matters) to give an insightful, friendly, and accurate take.
2. If the user asks about anything else (general questions, coding, chit-chat, everyday life), chat naturally and casually as a friend. Do NOT force connections to AI news or the digest if they're asking about an unrelated topic.
3. Keep answers warm, concise, conversational, and direct for mobile chat (WhatsApp/Telegram). Avoid robotic preamble, corporate disclaimers, or overly formal sign-offs.`;

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
      temperature: 0.75,
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
    telegramChatId: String(senderId || ''),
    role: 'assistant',
    content: assistantReply,
  });

  return assistantReply;
}

/**
 * Formats and delivers digest messages to Telegram or WhatsApp in chunked batches.
 *
 * @param {Array<Object>} selectedArticles
 * @param {string|number} targetId
 * @param {'telegram'|'whatsapp'} channel
 * @param {string} [header='📰 *Your Latest AI News Digest*\n\n']
 */
async function sendDigestMessages(selectedArticles, targetId, channel, header = '📰 *Your Latest AI News Digest*\n\n') {
  const isWhatsApp = channel === 'whatsapp';
  const articleBlocks = selectedArticles.map((a, i) =>
    isWhatsApp ? formatWhatsAppArticleEntry(a, i + 1) : formatArticleEntry(a, i + 1)
  );
  const MAX_CHUNK = 3800;
  const chunks = [];
  let currentBlocks = [];
  let currentLen = 0;
  for (const block of articleBlocks) {
    const extra = currentBlocks.length === 0 ? header.length : 0;
    if (currentLen + extra + block.length > MAX_CHUNK && currentBlocks.length > 0) {
      chunks.push(currentBlocks);
      currentBlocks = [];
      currentLen = 0;
    }
    currentBlocks.push(block);
    currentLen += block.length;
  }
  if (currentBlocks.length > 0) chunks.push(currentBlocks);

  const messages = chunks.map((blocks, idx) => {
    const chunkHeader = idx === 0
      ? header
      : `📰 *AI News Digest (cont'd ${idx + 1}/${chunks.length})*\n\n`;
    return `${chunkHeader}${blocks.join('')}`.trim();
  });

  for (let mi = 0; mi < messages.length; mi++) {
    if (isWhatsApp) {
      await whatsappService.sendWhatsAppMessage(targetId, messages[mi]);
    } else {
      await telegramService.sendTelegramMessage(messages[mi], targetId);
    }
    if (mi < messages.length - 1) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

/**
 * Generates and delivers an instant on-demand Welcome Digest for a brand-new user.
 * Scores last 24h summarized articles in-memory against user's InterestProfile.
 * Persists real ArticleRelevance records marked 'delivered' before sending to prevent duplicates.
 * Falls back if fewer than 5 qualifying articles are available.
 *
 * @param {Object} user - User document { clerkUserId, ... }
 * @param {string|number} targetId - Telegram chat ID or WhatsApp phone number
 * @param {'telegram'|'whatsapp'} channel
 * @returns {Promise<boolean>} True if welcome digest was delivered, false otherwise
 */
async function generateAndDeliverWelcomeDigest(user, targetId, channel) {
  const userId = user.clerkUserId;

  // 1. Fetch user's InterestProfile or fallback to default starter profile in DB
  let userProfile = await InterestProfile.findOne({ userId }).lean();
  if (!userProfile || !Array.isArray(userProfile.topics) || userProfile.topics.length === 0) {
    userProfile = await InterestProfile.findOne({ topics: { $exists: true, $not: { $size: 0 } } }).lean();
  }

  if (!userProfile || !Array.isArray(userProfile.topics) || userProfile.topics.length === 0) {
    console.log(`[Welcome Digest] No topics available for user "${userId}". Fallback to waiting message.`);
    return false;
  }

  // 2. Fetch candidate articles from last 24h that are primary and already summarized
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const candidateArticles = await Article.find({
    publishedAt: { $gte: since24h },
    isPrimary: true,
    summary: { $ne: null },
    whyReadThis: { $ne: null },
  }).lean();

  if (candidateArticles.length < 5) {
    console.log(`[Welcome Digest] Fewer than 5 summarized articles available in DB (${candidateArticles.length}). Fallback to waiting message.`);
    return false;
  }

  // 3. Score candidate articles in-memory against user topics
  const scored = [];
  for (const art of candidateArticles) {
    if (!art.embedding || art.embedding.length === 0) continue;
    const { bestRawSimilarity, rankingScore, matchedTopic } = scoreRelevance(art.embedding, userProfile.topics);
    const passesSimilarity = bestRawSimilarity >= config.RAW_SIMILARITY_THRESHOLD;
    const spamCheck = checkSpamKeywords(art.title);

    // Only qualify high and moderate tier matches (rankingScore >= 0.25)
    if (!spamCheck.isSpam && passesSimilarity && rankingScore >= 0.25) {
      const confidenceTier = rankingScore >= 0.35 ? 'high' : 'moderate';
      scored.push({
        article: art,
        bestRawSimilarity,
        rankingScore,
        matchedTopic,
        confidenceTier,
      });
    }
  }

  // 4. Must have at least 5 qualifying articles
  if (scored.length < 5) {
    console.log(`[Welcome Digest] Only ${scored.length} articles passed relevance threshold for user "${userId}". Fallback to waiting message.`);
    return false;
  }

  scored.sort((a, b) => b.rankingScore - a.rankingScore);
  const top5 = scored.slice(0, 5);

  // 5. CRITICAL: Persist as real ArticleRelevance records marked delivered BEFORE sending
  const now = new Date();
  const bulkOps = top5.map(({ article, bestRawSimilarity, rankingScore, matchedTopic, confidenceTier }) => ({
    updateOne: {
      filter: { userId, articleId: article._id },
      update: {
        $set: {
          userId,
          articleId: article._id,
          bestRawSimilarity,
          rankingScore,
          matchedTopic,
          isRelevant: true,
          filteredReason: null,
          confidenceTier,
          deliveryStatus: 'delivered',
          deliveredAt: now,
          createdAt: now,
        },
      },
      upsert: true,
    },
  }));

  await ArticleRelevance.bulkWrite(bulkOps);
  console.log(`[Welcome Digest] Persisted ${top5.length} ArticleRelevance records (delivered) for user "${userId}".`);

  // 6. Format and send welcome digest with unique conversational greeting
  const selectedArticles = top5.map(({ article, rankingScore, confidenceTier, matchedTopic }) => ({
    ...article,
    rankingScore,
    confidenceTier,
    matchedTopic,
  }));

  const welcomeGreeting = await generateDigestGreeting();
  if (welcomeGreeting) {
    if (channel === 'whatsapp') {
      await whatsappService.sendWhatsAppMessage(targetId, welcomeGreeting);
    } else {
      await telegramService.sendTelegramMessage(welcomeGreeting, targetId);
    }
    await new Promise((r) => setTimeout(r, 600));
  }

  const welcomeHeader = `📰 *Your Welcome AI News Digest*\n\nHere are top stories matching your interests from the past 24 hours:\n\n`;
  await sendDigestMessages(selectedArticles, targetId, channel, welcomeHeader);

  console.log(`[Welcome Digest] Successfully delivered welcome digest to user "${userId}" via ${channel}.`);
  return true;
}

/**
 * Generate a short, warm, unique one-sentence opening line for on-demand digest requests.
 * Uses Groq fresh on every call with varied phrasing, asking if they enjoy the digest or want adjustments.
 * Never blocks or delays digest delivery if Groq fails or times out.
 *
 * @returns {Promise<string|null>} 1-sentence greeting or null
 */
async function generateDigestGreeting() {
  try {
    const groqModel = config.GROQ_CHAT_MODEL || config.GROQ_MODEL || 'openai/gpt-oss-20b';

    const greetingPromise = groqRotator.callChatCompletion({
      model: groqModel,
      messages: [
        {
          role: 'system',
          content: 'You write brief, natural, warm one-sentence greetings from a friend who created an AI news bot. Output only the single sentence itself, no quotes, no preamble, and do not use placeholder names like [Name] or made-up names.'
        },
        {
          role: 'user',
          content: "Write one short, warm, casual opening line (1 sentence) greeting a friend and gently asking if they're enjoying their AI news digest or want anything adjusted. Vary the phrasing naturally and creatively — feel free to use varied styles like direct questions, casual check-ins, or friendly notes. Do not repeat the same opening structure or formula every time."
        }
      ],
      temperature: 1.0,
      max_tokens: 500,
    });

    // 4-second timeout to ensure greeting generation NEVER delays digest delivery
    const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), 4000));
    const completion = await Promise.race([greetingPromise, timeoutPromise]);

    if (!completion || !completion.choices?.[0]?.message?.content) {
      return null;
    }

    const greeting = completion.choices[0].message.content.trim().replace(/^["']|["']$/g, '');
    return greeting || null;
  } catch (err) {
    console.warn(`[Chat] Failed to generate dynamic digest greeting: ${err.message}`);
    return null;
  }
}

/**
 * Resend the user's most recently delivered digest on demand (Telegram or WhatsApp).
 * If user is brand new with 0 delivered digests, triggers on-demand welcome digest.
 *
 * @param {Object} user - User document
 * @param {string|number} targetId - Telegram chat ID or WhatsApp phone number
 * @param {Object} [options]
 * @param {'telegram'|'whatsapp'} [options.channel='telegram']
 * @returns {Promise<boolean>} Success status
 */
async function resendLatestDigest(user, targetId, options = {}) {
  const userId = user.clerkUserId;
  const channel = options.channel || 'telegram';
  const isWhatsApp = channel === 'whatsapp';

  const latestRel = await ArticleRelevance.findOne({
    userId,
    deliveryStatus: 'delivered',
  })
    .sort({ deliveredAt: -1 })
    .lean();

  if (!latestRel || !latestRel.deliveredAt) {
    // Attempt Option 2: On-demand instant welcome digest for new user
    const welcomeDelivered = await generateAndDeliverWelcomeDigest(user, targetId, channel);
    if (welcomeDelivered) {
      return true;
    }

    // Option 1 fallback: If < 5 relevant articles found, send clear waiting message
    const emptyMsg = `📭 *You're all set!*\n\nYou haven't received a digest yet because personalized digests are generated during scheduled delivery runs (*8:00 AM* & *6:00 PM IST*).\n\nYour first tailored digest will arrive at the next scheduled run. In the meantime, you can customize your tracked topics and relevance weights on your dashboard:\n${config.FRONTEND_URL}`;
    if (isWhatsApp) {
      await whatsappService.sendWhatsAppMessage(targetId, emptyMsg);
    } else {
      await telegramService.sendTelegramMessage(emptyMsg, targetId);
    }
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
    if (isWhatsApp) {
      await whatsappService.sendWhatsAppMessage(targetId, emptyMsg);
    } else {
      await telegramService.sendTelegramMessage(emptyMsg, targetId);
    }
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

  // Generate a dynamic, unique 1-sentence friendly greeting via Groq
  const greeting = await generateDigestGreeting();
  if (greeting) {
    if (isWhatsApp) {
      await whatsappService.sendWhatsAppMessage(targetId, greeting);
    } else {
      await telegramService.sendTelegramMessage(greeting, targetId);
    }
    await new Promise((r) => setTimeout(r, 600));
  }

  const header = `📰 *Your Latest AI News Digest*\n\n`;
  await sendDigestMessages(selectedArticles, targetId, channel, header);
  console.log(`[Chat] Resent latest digest to user "${userId}" via ${channel} (${selectedArticles.length} articles).`);
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
  generateDigestGreeting,
  resendLatestDigest,
  generateAndDeliverWelcomeDigest,
  sendDigestMessages,
  pruneOldChatMessages,
};
