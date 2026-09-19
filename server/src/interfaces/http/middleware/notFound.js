/**
 * Handles 404 for unmatched routes.
 * Must be registered after all route definitions.
 */
function notFoundHandler(req, res, _next) {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.originalUrl} not found`,
    },
  });
}

module.exports = { notFoundHandler };
