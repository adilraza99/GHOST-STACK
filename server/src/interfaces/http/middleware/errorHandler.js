const { logger } = require('../../../infrastructure/logging');

/**
 * Centralized error handling middleware.
 *
 * Catches all errors and returns a consistent JSON response.
 * Never exposes stack traces in non-development environments.
 *
 * Express 5 automatically catches async errors and passes them here.
 */
function errorHandler(err, req, res, _next) {
  const statusCode = err.statusCode || err.status || 500;
  const errorCode = err.errorCode || 'INTERNAL_ERROR';
  const message = err.expose !== false && err.message
    ? err.message
    : 'An unexpected error occurred';

  // Log the full error internally
  logger.error({
    err,
    requestId: req.requestId,
    method: req.method,
    url: req.originalUrl,
    statusCode,
    errorCode,
  }, message);

  const response = {
    success: false,
    error: {
      code: errorCode,
      message: statusCode === 500 && !err.expose ? 'An unexpected error occurred' : message,
    },
  };

  // Include stack trace only in development
  if (process.env.NODE_ENV === 'development' && err.stack) {
    response.error.stack = err.stack;
  }

  res.status(statusCode).json(response);
}

module.exports = { errorHandler };
