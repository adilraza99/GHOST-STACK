const { config, validateConfig } = require('./src/config');
const { logger } = require('./src/infrastructure/logging');
const { connectDatabase } = require('./src/infrastructure/database');
const { createApp } = require('./src/app');
const { createContainer } = require('./src/container');

/**
 * GhostStack Server Entry Point
 *
 * Responsible for:
 * 1. Validating configuration
 * 2. Connecting to MongoDB
 * 3. Creating the dependency container
 * 4. Starting the Express server
 * 5. Handling graceful shutdown
 */
async function start() {
  try {
    // Validate configuration before starting
    validateConfig();
    logger.info({ env: config.nodeEnv }, 'Configuration validated');

    // Connect to MongoDB
    await connectDatabase(config.mongoUri);

    // Create dependency container and Express app
    const container = createContainer();
    const app = createApp(container);

    const server = app.listen(config.port, () => {
      logger.info({
        port: config.port,
        env: config.nodeEnv,
      }, `GhostStack server listening on port ${config.port}`);
    });

    // Graceful shutdown
    const shutdown = async (signal) => {
      logger.info({ signal }, 'Shutdown signal received, closing gracefully...');
      server.close(async () => {
        const { disconnectDatabase } = require('./src/infrastructure/database');
        await disconnectDatabase();
        logger.info('Server shut down cleanly');
        process.exit(0);
      });

      // Force exit after 10 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (err) {
    logger.fatal({ err }, 'Failed to start GhostStack server');
    process.exit(1);
  }
}

start();
