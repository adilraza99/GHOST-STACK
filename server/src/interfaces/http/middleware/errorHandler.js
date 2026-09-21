const { logger } = require('../../../infrastructure/logging');
const {
  DomainError,
  ValidationError,
  InvalidEnumError,
  InvalidStateError,
  EntityNotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
} = require('../../../domain/errors');

/**
 * Maps domain/application errors to HTTP status codes and error codes.
 */
function mapDomainError(err) {
  if (err instanceof UnauthorizedError) {
    return { statusCode: 401, code: 'UNAUTHORIZED', message: err.message, expose: true };
  }
  if (err instanceof ForbiddenError) {
    return { statusCode: 403, code: 'FORBIDDEN', message: err.message, expose: true };
  }
  if (err instanceof EntityNotFoundError) {
    return { statusCode: 404, code: 'NOT_FOUND', message: err.message, expose: true };
  }
  if (err instanceof ValidationError || err instanceof InvalidEnumError) {
    return { statusCode: 400, code: err.code || 'VALIDATION_ERROR', message: err.message, expose: true };
  }
  if (err instanceof ConflictError) {
    return { statusCode: 409, code: 'CONFLICT', message: err.message, expose: true };
  }
  if (err instanceof InvalidStateError) {
    return { statusCode: 409, code: 'INVALID_STATE', message: err.message, expose: true };
  }
  if (err instanceof DomainError) {
    return { statusCode: 400, code: err.code || 'DOMAIN_ERROR', message: err.message, expose: true };
  }
  return null;
}

/**
 * Centralized error handling middleware.
 *
 * Catches all errors and returns a consistent JSON response.
 * Maps domain errors to appropriate HTTP status codes.
 * Never exposes stack traces in non-development environments.
 *
 * Express 5 automatically catches async errors and passes them here.
 */
function errorHandler(err, req, res, _next) {
  // Check for Zod validation errors
  if (err.name === 'ZodError') {
    const issues = err.issues || [];
    const message = issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
    logger.warn({ requestId: req.requestId, validationErrors: issues }, 'Validation failed');
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message,
      },
    });
  }

  // Check for domain errors
  const mapped = mapDomainError(err);
  if (mapped) {
    logger.warn({
      requestId: req.requestId,
      method: req.method,
      url: req.originalUrl,
      errorCode: mapped.code,
    }, mapped.message);

    return res.status(mapped.statusCode).json({
      success: false,
      error: {
        code: mapped.code,
        message: mapped.message,
      },
    });
  }

  // Fallback: unknown/unexpected errors
  const statusCode = err.statusCode || err.status || 500;
  const errorCode = err.errorCode || 'INTERNAL_ERROR';

  // Log full error internally
  logger.error({
    err,
    requestId: req.requestId,
    method: req.method,
    url: req.originalUrl,
    statusCode,
    errorCode,
  }, err.message || 'Unexpected error');

  const response = {
    success: false,
    error: {
      code: errorCode,
      message: statusCode === 500 ? 'An unexpected error occurred' : (err.message || 'An unexpected error occurred'),
    },
  };

  // Include stack trace only in development
  if (process.env.NODE_ENV === 'development' && err.stack) {
    response.error.stack = err.stack;
  }

  res.status(statusCode).json(response);
}

module.exports = { errorHandler };
