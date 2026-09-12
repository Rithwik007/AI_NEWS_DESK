const mongoose = require('mongoose');
const config = require('../config');

/**
 * Connect to MongoDB Atlas.
 * Mongoose handles connection pooling internally — no manual pool config needed.
 * On failure, logs error and exits (don't run pipeline with no DB).
 */
async function connectDB() {
  try {
    await mongoose.connect(config.MONGODB_URI);
    console.log('[DB] Connected to MongoDB Atlas');
  } catch (error) {
    console.error('[DB] Failed to connect to MongoDB:', error.message);
    process.exit(1);
  }
}

/**
 * Gracefully close MongoDB connection.
 */
async function disconnectDB() {
  await mongoose.disconnect();
  console.log('[DB] Disconnected from MongoDB');
}

module.exports = { connectDB, disconnectDB };
