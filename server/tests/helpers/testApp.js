const { createApp } = require('../../src/app');
const { createContainer } = require('../../src/container');

/**
 * Creates a test app with a real container (for integration tests).
 * The caller must handle mongoose connection and cleanup.
 */
function createTestApp() {
  const container = createContainer();
  const app = createApp(container);
  return { app, container };
}

module.exports = { createTestApp };
