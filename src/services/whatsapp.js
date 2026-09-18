const config = require('../config');

/**
 * Strips non-digit characters from phone number for Meta Cloud API.
 * e.g. "+91 98765-43210" -> "919876543210"
 *
 * @param {string} phone
 * @returns {string}
 */
function cleanPhoneNumber(phone) {
  if (!phone) return '';
  return String(phone).replace(/\D/g, '');
}

/**
 * Checks if a phone number matches the WHATSAPP_ALLOWED_NUMBERS allowlist.
 * Compares normalized digits to prevent formatting mismatches (+ vs no +, spaces, dashes).
 *
 * @param {string} phone
 * @returns {boolean}
 */
function isPhoneAllowed(phone) {
  if (!phone) return false;
  const clean = cleanPhoneNumber(phone);
  if (!clean) return false;
  const allowed = (config.WHATSAPP_ALLOWED_NUMBERS || []).map((n) => cleanPhoneNumber(n));
  return allowed.includes(clean);
}

/**
 * Formats single article entry for WhatsApp readability.
 * Note: WhatsApp doesn't support Markdown links [text](url). Raw URLs auto-link.
 *
 * @param {Object} article
 * @param {number} index
 * @returns {string}
 */
function formatWhatsAppArticleEntry(article, index) {
  const target = article.selectedArticleId || article;
  const title = (target.title || article.title || 'Untitled Article').trim();
  const url = (target.url || article.url || '').trim();
  const source = (target.source || article.source || '').trim();
  const summary = (article.summary || '').trim();
  const whyReadThis = (article.whyReadThis || '').trim();

  const sourceTag = source ? ` _(${source})_` : '';
  let entry = `*${index}. ${title}*${sourceTag}\n`;
  if (url) {
    entry += `🔗 ${url}\n`;
  }
  entry += `\n`;

  if (summary) {
    entry += `${summary}\n\n`;
  }
  if (whyReadThis) {
    entry += `💡 *Why read this:* ${whyReadThis}\n\n`;
  }
  return entry;
}

/**
 * Splits text into chunks fitting WhatsApp's 4096-character limit.
 *
 * @param {string} text
 * @param {number} [maxChunkSize=3800]
 * @returns {string[]}
 */
function chunkWhatsAppText(text, maxChunkSize = 3800) {
  if (!text || text.length <= maxChunkSize) return [text];

  const lines = text.split('\n');
  const chunks = [];
  let currentChunk = '';

  for (const line of lines) {
    if (currentChunk.length + line.length + 1 > maxChunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = '';
    }
    currentChunk += (currentChunk.length > 0 ? '\n' : '') + line;
  }

  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Send template message via Meta WhatsApp Cloud API.
 * Used for scheduled notifications (e.g. 8 AM / 6 PM digest ready alert).
 *
 * @param {string} toPhoneNumber - Destination phone number (E.164 or digits)
 * @param {string} templateName - Approved template name in Meta dashboard
 * @param {Array<string|number>} [parameters=[]] - Positional body parameters {{1}}, {{2}}, etc.
 * @param {string} [languageCode='en_US'] - Template language
 * @returns {Promise<Object>} Meta API response
 */
async function sendWhatsAppTemplate(toPhoneNumber, templateName, parameters = [], languageCode = 'en_US') {
  const recipient = cleanPhoneNumber(toPhoneNumber);
  if (!recipient) {
    throw new Error('Valid recipient phone number is required');
  }

  if (!config.WHATSAPP_PHONE_NUMBER_ID || !config.WHATSAPP_ACCESS_TOKEN) {
    throw new Error('WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN must be configured in environment');
  }

  const endpoint = `https://graph.facebook.com/${config.WHATSAPP_API_VERSION || 'v20.0'}/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipient,
    type: 'template',
    template: {
      name: templateName,
      language: {
        code: languageCode,
      },
    },
  };

  if (parameters && parameters.length > 0) {
    payload.template.components = [
      {
        type: 'body',
        parameters: parameters.map((param) => ({
          type: 'text',
          text: String(param),
        })),
      },
    ];
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    const errMsg = data.error ? `${data.error.message} (code: ${data.error.code})` : res.statusText;
    throw new Error(`WhatsApp Template API error HTTP ${res.status}: ${errMsg}`);
  }

  return data;
}

/**
 * Send free-form text message via Meta WhatsApp Cloud API.
 * Used for responses within the 24-hour user-initiated messaging window.
 *
 * @param {string} toPhoneNumber - Destination phone number
 * @param {string} text - Message text
 * @returns {Promise<Object>} Meta API response (last chunk result)
 */
async function sendWhatsAppMessage(toPhoneNumber, text) {
  const recipient = cleanPhoneNumber(toPhoneNumber);
  if (!recipient) {
    throw new Error('Valid recipient phone number is required');
  }

  if (!config.WHATSAPP_PHONE_NUMBER_ID || !config.WHATSAPP_ACCESS_TOKEN) {
    throw new Error('WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN must be configured in environment');
  }

  const endpoint = `https://graph.facebook.com/${config.WHATSAPP_API_VERSION || 'v20.0'}/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const chunks = chunkWhatsAppText(text, 3800);

  let lastResponse = null;
  for (let i = 0; i < chunks.length; i++) {
    const chunkText = chunks[i];
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipient,
      type: 'text',
      text: {
        preview_url: false,
        body: chunkText,
      },
    };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      const errMsg = data.error ? `${data.error.message} (code: ${data.error.code})` : res.statusText;
      throw new Error(`WhatsApp Message API error HTTP ${res.status}: ${errMsg}`);
    }

    lastResponse = data;
    if (i < chunks.length - 1) {
      // Short delay between chunks
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  return lastResponse;
}

module.exports = {
  cleanPhoneNumber,
  isPhoneAllowed,
  formatWhatsAppArticleEntry,
  chunkWhatsAppText,
  sendWhatsAppTemplate,
  sendWhatsAppMessage,
};
