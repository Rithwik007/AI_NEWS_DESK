const config = require('../config');

/**
 * Escape special Markdown (v1) characters in text.
 * Legacy Markdown only requires escaping *, _, `, [, and \.
 * Does NOT require escaping ., -, !, (, ) which makes text much cleaner than MarkdownV2.
 *
 * @param {string} text
 * @returns {string}
 */
function escapeMarkdown(text = '') {
  if (!text) return '';
  return String(text).replace(/([*_`\[\\])/g, '\\$1');
}

/**
 * Format article URL safely for Markdown link.
 * Replaces closing parenthesis to avoid prematurely closing [title](url).
 *
 * @param {string} url
 * @returns {string}
 */
function safeUrl(url = '') {
  if (!url) return '';
  return url.replace(/\)/g, '%29');
}

/**
 * Format an individual article entry for Telegram.
 *
 * @param {Object} article
 * @param {number} index
 * @returns {string}
 */
function formatArticleEntry(article, index) {
  // Use selected article if populated (Step 3 selection), else fallback to primary article
  const target = article.selectedArticleId || article;
  const title = (target.title || article.title || 'Untitled Article').trim();
  const url = (target.url || article.url || '').trim();
  const source = (target.source || article.source || '').trim();
  const summary = (article.summary || '').trim();
  const whyReadThis = (article.whyReadThis || '').trim();

  const titleLink = url ? `[${escapeMarkdown(title)}](${safeUrl(url)})` : `*${escapeMarkdown(title)}*`;
  const sourceTag = source ? ` _(${escapeMarkdown(source)})_` : '';

  let entry = `${index}. ${titleLink}${sourceTag}\n\n`;
  if (summary) {
    entry += `${escapeMarkdown(summary)}\n\n`;
  }
  if (whyReadThis) {
    entry += `💡 *Why read this:* ${escapeMarkdown(whyReadThis)}\n\n`;
  }
  return entry;
}

/**
 * Build chunks of articles that fit within Telegram's 4096-char limit.
 *
 * @param {string} tierHeader
 * @param {Array<Object>} articles
 * @param {number} maxChunkSize - Default 3800 to leave safety margin
 * @returns {Array<string>} Formatted message strings ready to send
 */
function buildTierMessages(tier, articles, maxChunkSize = 3800) {
  if (!articles || articles.length === 0) return [];

  const tierHeaders = {
    high: '🔴 *Today\'s AI News — High Confidence*',
    moderate: '🟡 *Today\'s AI News — Moderate Confidence*',
    low: '🔵 *Today\'s AI News — Low Confidence / Peripheral*',
  };

  const baseHeader = tierHeaders[tier] || `*Today's AI News — ${escapeMarkdown(tier)}*`;

  // First format all article blocks
  const articleBlocks = articles.map((a, i) => formatArticleEntry(a, i + 1));

  // Group blocks into chunks
  const chunks = [];
  let currentChunkArticles = [];
  let currentLength = 0;

  for (const block of articleBlocks) {
    // If adding this block exceeds limit and we already have articles in chunk, flush current chunk
    if (currentLength + block.length > maxChunkSize && currentChunkArticles.length > 0) {
      chunks.push(currentChunkArticles);
      currentChunkArticles = [];
      currentLength = 0;
    }
    currentChunkArticles.push(block);
    currentLength += block.length;
  }

  if (currentChunkArticles.length > 0) {
    chunks.push(currentChunkArticles);
  }

  // Format final messages with pagination headers if multiple chunks
  return chunks.map((chunkBlocks, idx) => {
    let header = baseHeader;
    if (chunks.length > 1) {
      header = `${baseHeader} (${idx + 1}/${chunks.length})`;
    }
    return `${header}\n\n${chunkBlocks.join('')}`.trim();
  });
}

/**
 * Send a single message to Telegram Bot API.
 *
 * @param {string} text
 * @param {string} [chatId]
 * @returns {Promise<Object>} Telegram API response
 */
async function sendTelegramMessage(text, chatId = config.TELEGRAM_CHAT_ID) {
  if (!config.TELEGRAM_BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN is not configured');
  }
  if (!chatId) {
    throw new Error('TELEGRAM_CHAT_ID is not configured');
  }

  const endpoint = `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/sendMessage`;

  const payload = {
    chat_id: chatId,
    text,
    parse_mode: 'Markdown',
    disable_web_page_preview: true, // Clean scannable feed without giant URL previews
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok || !data.ok) {
    const desc = data.description || (await response.text());
    throw new Error(`Telegram API error HTTP ${response.status}: ${desc}`);
  }

  return data;
}

/**
 * Deliver top N (default 5) highest-priority articles in a single Telegram message per user.
 * Excludes low-confidence tier entirely.
 *
 * @param {Object} [options]
 * @param {boolean} [options.dryRun=false]
 * @param {boolean} [options.forceDeliverAll=false]
 * @param {number} [options.limit]
 * @returns {Promise<Object>} Delivery summary
 */
async function deliverTopStoriesMultiUser(options = {}) {
  const Article = require('../models/Article');
  const ArticleRelevance = require('../models/ArticleRelevance');
  const User = require('../models/User');
  const PipelineRun = require('../models/PipelineRun');
  const startTime = Date.now();
  const limit = options.limit || config.TOP_STORIES_LIMIT || 5;
  const runType = options.runType || config.RUN_TYPE || 'morning';

  console.log('\n======================================================');
  console.log('STEP 4: TELEGRAM TOP STORIES DELIVERY (MULTI-USER)');
  console.log(`Limit: Top ${limit} articles (High & Moderate tier only)`);
  console.log(`Run Type: ${runType.toUpperCase()} ${runType === 'evening' ? '(Incremental since morning run)' : '(Full window)'}`);
  console.log('======================================================\n');

  // Age out stale eligible relevance records older than ARTICLE_MAX_AGE_HOURS
  const cutoff = new Date(Date.now() - config.ARTICLE_MAX_AGE_HOURS * 60 * 60 * 1000);
  const staleArticleIds = await Article.find({ publishedAt: { $lt: cutoff } }).distinct('_id');
  const expireResult = await ArticleRelevance.updateMany(
    {
      isRelevant: true,
      deliveryStatus: { $nin: ['delivered', 'expired'] },
      articleId: { $in: staleArticleIds },
    },
    {
      $set: {
        deliveryStatus: 'expired',
      },
    }
  );
  if (expireResult.modifiedCount > 0) {
    console.log(`[Telegram] Aged out ${expireResult.modifiedCount} stale undelivered relevance records older than ${config.ARTICLE_MAX_AGE_HOURS}h (deliveryStatus = "expired").`);
  }

  // In evening mode: determine timestamp of last successful morning run for today
  let morningCutoff = null;
  if (runType === 'evening') {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const lastMorningRun = await PipelineRun.findOne({
      runType: 'morning',
      status: 'success',
      completedAt: { $gte: todayStart },
    }).sort({ completedAt: -1 }).lean();

    if (lastMorningRun && lastMorningRun.completedAt) {
      morningCutoff = lastMorningRun.completedAt;
      console.log(`[Telegram] Evening run mode: Found morning run from ${morningCutoff.toISOString()}. Filtering articles newly fetched after morning run.`);
    } else {
      console.log(`[Telegram] Evening run mode: No prior morning run found for today. Falling back to full rolling ${config.ARTICLE_MAX_AGE_HOURS}h window.`);
    }
  }

  // Find all users with a linked Telegram chat ID
  const userQuery = { telegramChatId: { $ne: null } };
  if (options.userId) {
    userQuery.clerkUserId = options.userId;
  }
  const users = await User.find(userQuery).lean();
  console.log(`[Telegram] Found ${users.length} user(s) with linked Telegram chat ID.`);

  let totalMessagesSent = 0;
  let totalArticlesDelivered = 0;
  const errors = [];
  const userDeliveryResults = [];

  for (const user of users) {
    console.log(`\n[Telegram] Processing user "${user.clerkUserId}" (chat ID: ${user.telegramChatId})...`);

    // Query user's eligible ArticleRelevance records
    const relQuery = {
      userId: user.clerkUserId,
      isRelevant: true,
      confidenceTier: { $in: ['high', 'moderate'] },
    };
    if (!options.forceDeliverAll) {
      relQuery.deliveryStatus = { $nin: ['delivered', 'expired'] };
    }

    const userRels = await ArticleRelevance.find(relQuery)
      .populate({
        path: 'articleId',
        populate: { path: 'selectedArticleId' },
      })
      .sort({ rankingScore: -1 })
      .lean();

    // Filter to articles that have completed LLM summarization (+ evening incremental cutoff)
    const eligibleRels = userRels.filter((r) => {
      const art = r.articleId;
      if (!art || !art.summary || !art.whyReadThis) return false;
      if (runType === 'evening' && morningCutoff) {
        return art.fetchedAt && art.fetchedAt > morningCutoff;
      }
      return true;
    });

    console.log(`[Telegram] User "${user.clerkUserId}": ${eligibleRels.length} eligible articles found.`);

    if (eligibleRels.length === 0) {
      console.log(`[Telegram] No eligible articles for user "${user.clerkUserId}". Skipping message.`);
      userDeliveryResults.push({
        userId: user.clerkUserId,
        chatId: user.telegramChatId,
        eligibleCount: 0,
        deliveredCount: 0,
      });
      continue;
    }

    // Select top N for this user
    const selectedRels = eligibleRels.slice(0, limit);
    const selectedArticles = selectedRels.map((r) => ({
      ...r.articleId,
      _id: r.articleId._id,
      relevanceId: r._id,
      rankingScore: r.rankingScore,
      confidenceTier: r.confidenceTier,
      matchedTopic: r.matchedTopic,
    }));

    console.log(`[Telegram] Selected top ${selectedArticles.length} articles for user "${user.clerkUserId}".`);

    // Format single message for user
    const header = runType === 'evening'
      ? (morningCutoff ? `🌆 *Today's Evening AI News — Incremental Top Stories*\n\n` : `🌆 *Today's Evening AI News — Full Digest*\n\n`)
      : `🔥 *Today's Top AI Stories*\n\n`;
    let entries = selectedArticles.map((a, i) => formatArticleEntry(a, i + 1)).join('');
    let messageText = `${header}${entries}`.trim();

    // Compact if exceeds limit
    if (messageText.length > 4000) {
      const compactEntries = selectedArticles.map((a, i) => {
        const target = a.selectedArticleId || a;
        const title = (target.title || a.title || 'Untitled Article').trim();
        const url = (target.url || a.url || '').trim();
        const source = (target.source || a.source || '').trim();
        let summary = (a.summary || '').trim();
        let whyReadThis = (a.whyReadThis || '').trim();

        if (summary.length > 200) {
          summary = summary.slice(0, 197).replace(/\s+\S*$/, '') + '...';
        }
        if (whyReadThis.length > 160) {
          whyReadThis = whyReadThis.slice(0, 157).replace(/\s+\S*$/, '') + '...';
        }

        const titleLink = url ? `[${escapeMarkdown(title)}](${safeUrl(url)})` : `*${escapeMarkdown(title)}*`;
        const sourceTag = source ? ` _(${escapeMarkdown(source)})_` : '';

        let entry = `${i + 1}. ${titleLink}${sourceTag}\n\n`;
        if (summary) entry += `${escapeMarkdown(summary)}\n\n`;
        if (whyReadThis) entry += `💡 *Why read this:* ${escapeMarkdown(whyReadThis)}\n\n`;
        return entry;
      }).join('');

      messageText = `${header}${compactEntries}`.trim();
    }

    let sendSuccess = false;

    if (options.dryRun) {
      console.log(`[DRY RUN] Would send digest to ${user.telegramChatId} (${selectedArticles.length} articles, ${messageText.length} chars)`);
      totalMessagesSent++;
      totalArticlesDelivered += selectedArticles.length;
      sendSuccess = true;
    } else {
      try {
        console.log(`[Telegram] Sending digest to ${user.telegramChatId} (${messageText.length} chars)...`);
        await sendTelegramMessage(messageText, user.telegramChatId);
        totalMessagesSent++;
        totalArticlesDelivered += selectedArticles.length;
        sendSuccess = true;
        console.log(`[Telegram] ✓ Digest sent successfully to ${user.telegramChatId}.`);
      } catch (err) {
        console.error(`[Telegram] ✗ Failed to send digest to ${user.telegramChatId}: ${err.message}`);
        errors.push({ userId: user.clerkUserId, chatId: user.telegramChatId, error: err.message });
      }
    }

    // Mark delivery on ArticleRelevance ONLY for this user
    if (sendSuccess && !options.dryRun) {
      const deliveredRelIds = selectedRels.map((r) => r._id);
      await ArticleRelevance.updateMany(
        {
          _id: { $in: deliveredRelIds },
          userId: user.clerkUserId,
        },
        {
          $set: {
            deliveredAt: new Date(),
            deliveryStatus: 'delivered',
          },
        }
      );
      console.log(`[Telegram] Updated ${deliveredRelIds.length} ArticleRelevance records for user "${user.clerkUserId}" with deliveryStatus = "delivered".`);
    }

    userDeliveryResults.push({
      userId: user.clerkUserId,
      chatId: user.telegramChatId,
      eligibleCount: eligibleRels.length,
      deliveredCount: selectedArticles.length,
      articles: selectedArticles.map((a) => ({
        id: a._id,
        title: a.selectedArticleId?.title || a.title,
        rankingScore: a.rankingScore,
        confidenceTier: a.confidenceTier,
      })),
    });

    // Short delay between users to avoid Telegram rate limits
    if (users.length > 1) {
      await new Promise((resolve) => setTimeout(resolve, config.TELEGRAM_SEND_DELAY_MS));
    }
  }

  // Record PipelineRun if not dryRun
  if (!options.dryRun) {
    await PipelineRun.create({
      runType,
      deliveryMode: 'top5',
      status: errors.length === 0 ? 'success' : (totalMessagesSent > 0 ? 'partial' : 'failed'),
      startedAt: new Date(startTime),
      completedAt: new Date(),
      articlesDeliveredCount: totalArticlesDelivered,
      messagesSent: totalMessagesSent,
      error: errors.length > 0 ? errors.map((e) => `${e.userId}: ${e.error}`).join('; ') : null,
    });
  }

  const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n======================================================');
  console.log('TELEGRAM MULTI-USER DELIVERY SUMMARY');
  console.log(`Users Processed:     ${users.length}`);
  console.log(`Messages Sent:       ${totalMessagesSent}`);
  console.log(`Articles Delivered:  ${totalArticlesDelivered}`);
  console.log(`Errors Encountered:  ${errors.length}`);
  console.log(`Elapsed Time:        ${elapsedSec}s`);
  console.log('======================================================\n');

  return {
    mode: 'top5',
    runType,
    usersProcessed: users.length,
    totalMessagesSent,
    totalArticles: totalArticlesDelivered,
    userResults: userDeliveryResults,
    errors,
  };
}

/**
 * Dispatcher to deliver according to config or options.
 *
 * @param {Object} [options]
 * @returns {Promise<Object>}
 */
async function deliverToTelegram(options = {}) {
  return deliverTopStoriesMultiUser(options);
}

module.exports = {
  escapeMarkdown,
  safeUrl,
  formatArticleEntry,
  buildTierMessages,
  sendTelegramMessage,
  deliverTopStoriesMultiUser,
  deliverTop5ToTelegram: deliverTopStoriesMultiUser,
  deliverToTelegram,
};
