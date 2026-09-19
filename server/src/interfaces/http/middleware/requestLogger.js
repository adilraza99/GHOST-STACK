const { logger } = require('../../../infrastructure/logging');

/**
 * Logs incoming requests and their response times using Pino.
 */
function requestLogger(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      requestId: req.requestId,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration,
    };

    if (res.statusCode >= 400) {
      logger.warn(logData, 'request completed with error');
    } else {
      logger.info(logData, 'request completed');
    }
  });

  next();
}

module.exports = { requestLogger };
