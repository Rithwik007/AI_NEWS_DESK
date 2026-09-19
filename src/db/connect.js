const mongoose = require('mongoose');
const config = require('../config');

let _reconnecting = false;
let _connectionPromise = null;

/**
 * Connect to MongoDB Atlas with resilient connection settings.
 * Removes aggressive 45s socketTimeoutMS that previously caused idle socket drops on Render.
 *
 * @returns {Promise<mongoose.Connection>}
 */
async function connectDB() {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (_connectionPromise) {
    return _connectionPromise;
  }

  _connectionPromise = (async () => {
    try {
      await mongoose.connect(config.MONGODB_URI, {
        serverSelectionTimeoutMS: 10000, // 10s timeout to find Atlas server
        heartbeatFrequencyMS: 10000,     // Ping Atlas every 10s to keep connection warm
        maxPoolSize: 10,                 // Up to 10 connections
        minPoolSize: 1,                  // Keep at least 1 socket alive
      });
      console.log('[DB] Connected to MongoDB Atlas (readyState: 1)');
      return mongoose.connection;
    } catch (error) {
      console.error('[DB] Failed to connect to MongoDB:', error.message);
      throw error;
    } finally {
      _connectionPromise = null;
    }
  })();

  return _connectionPromise;
}

/**
 * Ensures MongoDB is connected before running any database operation.
 * If connection dropped or in idle state, auto-reconnects on-demand.
 *
 * @returns {Promise<void>}
 */
async function ensureDBConnected() {
  if (mongoose.connection.readyState === 1) {
    return;
  }

  console.warn(`[DB] Connection not ready (readyState: ${mongoose.connection.readyState}). Reconnecting...`);
  await connectDB();
}

// Global connection event handlers for visibility and auto-recovery
mongoose.connection.on('disconnected', async () => {
  console.warn('[DB] MongoDB connection lost — scheduling immediate auto-reconnect...');
  if (!_reconnecting) {
    _reconnecting = true;
    try {
      await connectDB();
      console.log('[DB] Auto-reconnect succeeded.');
    } catch (err) {
      console.error('[DB] Auto-reconnect attempt failed:', err.message);
    } finally {
      _reconnecting = false;
    }
  }
});

mongoose.connection.on('reconnected', () => {
  console.log('[DB] MongoDB reconnected successfully.');
  _reconnecting = false;
});

mongoose.connection.on('error', (err) => {
  console.error('[DB] MongoDB connection error:', err.message);
});

/**
 * Gracefully close MongoDB connection.
 */
async function disconnectDB() {
  await mongoose.disconnect();
  console.log('[DB] Disconnected from MongoDB');
}

module.exports = {
  connectDB,
  ensureDBConnected,
  disconnectDB,
};
