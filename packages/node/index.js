/**
 * @ghoststack/node
 *
 * Production-grade Node.js SDK for GHOST-STACK incident intelligence and distributed tracing.
 */

const GhostStackClient = require('./src/GhostStackClient');
const { ConfigError } = require('./src/config');
const { parseTraceparent, formatTraceparent, injectTraceContext } = require('./src/traceContext');

let globalClient = null;

/**
 * Initializes the GhostStack SDK singleton client.
 *
 * @param {object} [options={}]
 * @returns {GhostStackClient}
 */
function init(options = {}) {
  if (globalClient && !globalClient.isShutdown) {
    if (options.debug) {
      console.warn('[@ghoststack/node] init() called more than once. Returning existing singleton client.');
    }
    return globalClient;
  }

  globalClient = new GhostStackClient(options);
  return globalClient;
}

/**
 * Returns the active GhostStack singleton client.
 *
 * @returns {GhostStackClient|null}
 */
function getClient() {
  return globalClient;
}

/**
 * Convenience helper to get Express middleware from singleton client.
 *
 * @returns {import('express').RequestHandler}
 */
function middleware() {
  if (!globalClient) {
    throw new Error('[@ghoststack/node] Must call init() before using middleware()');
  }
  return globalClient.middleware();
}

/**
 * Shuts down the active singleton client if present.
 *
 * @param {object} [options]
 * @returns {Promise<void>}
 */
async function shutdown(options) {
  if (globalClient) {
    const client = globalClient;
    globalClient = null;
    await client.shutdown(options);
  }
}

module.exports = {
  init,
  getClient,
  shutdown,
  middleware,
  GhostStackClient,
  ConfigError,
  parseTraceparent,
  formatTraceparent,
  injectTraceContext,
};
