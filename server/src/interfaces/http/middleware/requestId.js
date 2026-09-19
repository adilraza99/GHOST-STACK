const { v4: uuidv4 } = require('uuid');

/**
 * Attaches a unique requestId to every incoming request.
 * Uses the client-provided X-Request-ID header if present, otherwise generates one.
 */
function requestIdMiddleware(req, res, next) {
  req.requestId = req.headers['x-request-id'] || uuidv4();
  res.setHeader('X-Request-ID', req.requestId);
  next();
}

module.exports = { requestIdMiddleware };
