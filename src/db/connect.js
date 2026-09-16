const mongoose = require('mongoose');
const config = require('../config');

let _reconnecting = false;

/**
 * Connect to MongoDB Atlas with resilience options.
 * - serverSelectionTimeoutMS: how long to wait to find a usable server before giving up
 * - socketTimeoutMS: how long an idle socket is kept alive before closing
 * - heartbeatFrequencyMS: how often the driver pings the server to detect disconnects
 * - maxPoolSize: keep pool small for free-tier (default 100 is excessive)
 * Mongoose auto-reconnects internally; event listeners log the transitions so
 * we can see Atlas idle-drop events in Render logs.
 */
async function connectDB() {
  try {
    await mongoose.connect(config.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,  // Fail fast if Atlas unreachable at startup
      socketTimeoutMS: 45000,           // Close idle sockets after 45s
      heartbeatFrequencyMS: 10000,      // Ping Atlas every 10s to detect drops early
      maxPoolSize: 5,                   // Free-tier: keep pool small
    });
    console.log('[DB] Connected to MongoDB Atlas');
  } catch (error) {
    console.error('[DB] Failed to connect to MongoDB:', error.message);
    process.exit(1);
  }

  // Monitor connection state transitions — visible in Render logs
  mongoose.connection.on('disconnected', () => {
    console.warn('[DB] MongoDB connection lost — Mongoose will attempt reconnect...');
  });
  mongoose.connection.on('reconnected', () => {
    console.log('[DB] MongoDB reconnected successfully.');
    _reconnecting = false;
  });
  mongoose.connection.on('error', (err) => {
    console.error('[DB] MongoDB connection error:', err.message);
  });
}

/**
 * Gracefully close MongoDB connection.
 */
async function disconnectDB() {
  await mongoose.disconnect();
  console.log('[DB] Disconnected from MongoDB');
}

module.exports = { connectDB, disconnectDB };

