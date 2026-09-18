const mongoose = require('mongoose');

/**
 * PipelineRun schema — records execution metadata for delivery runs.
 * Enables tracking the timestamp of the last successful morning run
 * so evening runs can deliver incremental digests.
 */
const pipelineRunSchema = new mongoose.Schema({
  runType: {
    type: String,
    enum: ['morning', 'evening'],
    required: true,
  },
  deliveryMode: {
    type: String,
    enum: ['top5', 'all_tiers'],
    default: 'top5',
  },
  status: {
    type: String,
    enum: ['success', 'failed', 'partial'],
    default: 'success',
  },
  startedAt: {
    type: Date,
    default: Date.now,
  },
  completedAt: {
    type: Date,
    default: Date.now,
  },
  articlesDeliveredCount: {
    type: Number,
    default: 0,
  },
  messagesSent: {
    type: Number,
    default: 0,
  },
  error: {
    type: String,
    default: null,
  },
  channels: {
    telegram: {
      attempted: { type: Number, default: 0 },
      succeeded: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      errors: [{ type: String }],
    },
    whatsapp: {
      attempted: { type: Number, default: 0 },
      succeeded: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      errors: [{ type: String }],
    },
  },
});

// Indexes for fast lookup of last successful run by type
pipelineRunSchema.index({ runType: 1, status: 1, completedAt: -1 });

const PipelineRun = mongoose.model('PipelineRun', pipelineRunSchema);

module.exports = PipelineRun;
