const mongoose = require('mongoose');
const { logger } = require('../logging');

/**
 * Connects to MongoDB using the provided URI.
 * Handles connection events and logs status.
 *
 * @param {string} uri - MongoDB connection URI
 * @returns {Promise<typeof mongoose>}
 */
async function connectDatabase(uri) {
  try {
    mongoose.connection.on('connected', () => {
      logger.info('MongoDB connected');
    });

    mongoose.connection.on('error', (err) => {
      logger.error({ err }, 'MongoDB connection error');
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
    });

    await mongoose.connect(uri);

    return mongoose;
  } catch (err) {
    logger.fatal({ err }, 'Failed to connect to MongoDB');
    throw err;
  }
}

/**
 * Disconnects from MongoDB cleanly.
 */
async function disconnectDatabase() {
  await mongoose.disconnect();
  logger.info('MongoDB disconnected cleanly');
}

/**
 * Returns the current database connection state.
 * States: 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
 */
function getDatabaseStatus() {
  const state = mongoose.connection.readyState;
  const stateMap = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };
  return {
    state: stateMap[state] || 'unknown',
    readyState: state,
  };
}

module.exports = { connectDatabase, disconnectDatabase, getDatabaseStatus };
