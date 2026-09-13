const config = require('../config');

/**
 * Groq API Key Rotator & Failover Manager.
 *
 * Rotates across multiple Groq API keys to distribute load, maximize available TPM/RPM,
 * and provide seamless failover when a key encounters an HTTP 429 rate limit or quota exhaustion.
 */
class GroqRotator {
  constructor() {
    this.refreshKeys();
  }

  /**
   * Reload keys from configuration and eliminate duplicates.
   */
  refreshKeys() {
    const rawKeys = [
      ...(config.GROQ_API_KEYS || []),
      config.GROQ_API_KEY,
    ].filter(Boolean);

    this.keys = [...new Set(rawKeys)];
    this.currentIndex = 0;
    this.cooldowns = new Map(); // keyIndex -> cooldownExpiresAt timestamp
    console.log(`[Groq Rotator] Initialized with ${this.keys.length} Groq API key(s).`);
  }

  /**
   * Mask API key for secure logging (e.g. gsk_abc...xyz1).
   *
   * @param {string} key
   * @returns {string}
   */
  maskKey(key) {
    if (!key || typeof key !== 'string' || key.length < 10) return '***';
    return `${key.slice(0, 7)}...${key.slice(-4)}`;
  }

  /**
   * Total number of configured unique keys.
   *
   * @returns {number}
   */
  getActiveKeyCount() {
    return this.keys.length;
  }

  /**
   * Retrieve currently active API key, skipping keys currently on rate-limit cooldown.
   *
   * @returns {string}
   */
  getCurrentKey() {
    if (this.keys.length === 0) {
      throw new Error('No Groq API keys configured in environment or .env');
    }

    const now = Date.now();
    let checked = 0;

    while (checked < this.keys.length) {
      const cooldownUntil = this.cooldowns.get(this.currentIndex) || 0;
      if (now >= cooldownUntil) {
        return this.keys[this.currentIndex];
      }
      // Current key on cooldown — advance to next
      this.currentIndex = (this.currentIndex + 1) % this.keys.length;
      checked++;
    }

    // All keys currently on cooldown — return current key anyway
    return this.keys[this.currentIndex];
  }

  /**
   * Explicitly rotate to the next key in the pool.
   *
   * @param {string} [reason='manual']
   * @returns {string} The new active key
   */
  rotateToNextKey(reason = 'manual') {
    if (this.keys.length <= 1) return this.keys[0] || '';

    const prevIndex = this.currentIndex;
    this.currentIndex = (this.currentIndex + 1) % this.keys.length;
    console.log(
      `[Groq Rotator] Rotated key from slot ${prevIndex + 1}/${this.keys.length} (${this.maskKey(this.keys[prevIndex])}) ` +
      `to slot ${this.currentIndex + 1}/${this.keys.length} (${this.maskKey(this.keys[this.currentIndex])}) [Reason: ${reason}]`
    );
    return this.keys[this.currentIndex];
  }

  /**
   * Mark a key as rate-limited and apply temporary cooldown.
   *
   * @param {string} key
   * @param {number} [cooldownMs=60000] - Default 60 seconds
   */
  markKeyRateLimited(key, cooldownMs = 60000) {
    const idx = this.keys.indexOf(key);
    if (idx !== -1) {
      this.cooldowns.set(idx, Date.now() + cooldownMs);
      console.warn(`[Groq Rotator] Key slot ${idx + 1} (${this.maskKey(key)}) marked rate-limited for ${cooldownMs / 1000}s.`);
    }
    this.rotateToNextKey('429_rate_limit');
  }

  /**
   * Execute chat completion call to Groq API with automatic key rotation and failover.
   *
   * @param {Object} requestBody - Standard OpenAI/Groq chat completion payload
   * @returns {Promise<Object>} Parsed JSON response from Groq
   */
  async callChatCompletion(requestBody) {
    const endpoint = 'https://api.groq.com/openai/v1/chat/completions';
    const maxAttempts = Math.max(this.keys.length, 1);
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const apiKey = this.getCurrentKey();

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(requestBody),
        });

        const data = await response.json();

        // Check for 429 Rate Limit
        if (
          response.status === 429 ||
          data.error?.code === 'rate_limit_exceeded' ||
          (data.error?.message && /rate limit/i.test(data.error.message))
        ) {
          console.warn(
            `[Groq Rotator] HTTP 429 Rate Limit on key ${this.maskKey(apiKey)} (attempt ${attempt}/${maxAttempts}). Rotating to next key...`
          );
          this.markKeyRateLimited(apiKey);
          continue;
        }

        // Check for Auth / Quota errors
        if (response.status === 401 || response.status === 403) {
          console.warn(
            `[Groq Rotator] HTTP ${response.status} on key ${this.maskKey(apiKey)}. Rotating to next key...`
          );
          this.rotateToNextKey(`http_${response.status}`);
          continue;
        }

        if (!response.ok) {
          const errMsg = data.error?.message || response.statusText;
          throw new Error(`Groq API error HTTP ${response.status}: ${errMsg}`);
        }

        return data;
      } catch (err) {
        lastError = err;
        const isNetworkErr = /fetch|network|econnreset|etimedout/i.test(err.message);
        if (isNetworkErr && attempt < maxAttempts) {
          console.warn(`[Groq Rotator] Network error on key ${this.maskKey(apiKey)}: ${err.message}. Rotating...`);
          this.rotateToNextKey('network_retry');
          continue;
        }
        throw err;
      }
    }

    throw lastError || new Error('All Groq API keys exhausted or rate-limited.');
  }
}

module.exports = new GroqRotator();
