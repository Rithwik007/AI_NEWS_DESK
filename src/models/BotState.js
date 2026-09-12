const mongoose = require('mongoose');

/**
 * BotState schema — key-value store for bot metadata and state.
 * Used to persist the Telegram polling offset (last_update_id) across process restarts.
 */
const botStateSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  value: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

const BotState = mongoose.model('BotState', botStateSchema);

module.exports = BotState;
