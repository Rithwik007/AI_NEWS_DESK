const mongoose = require('mongoose');

/**
 * ChatMessage schema — stores user and assistant conversation turns for the Telegram bot.
 *
 * Indexed on { userId: 1, createdAt: -1 } for efficient retrieval of recent message context
 * and rate-limit count queries within time windows.
 */
const chatMessageSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true,
  },
  telegramChatId: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ['user', 'assistant'],
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

chatMessageSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
