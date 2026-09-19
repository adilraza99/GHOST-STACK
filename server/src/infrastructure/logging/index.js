const pino = require('pino');
const { config } = require('../../config');

/**
 * Creates a Pino logger instance.
 * Uses pino-pretty for development, structured JSON for production.
 */
function createLogger(name = 'ghoststack') {
  const options = {
    name,
    level: config.logLevel,
  };

  // Use pino-pretty transport for human-readable dev logs
  if (config.isDevelopment()) {
    options.transport = {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    };
  }

  return pino(options);
}

// Default application logger
const logger = createLogger();

module.exports = { createLogger, logger };
