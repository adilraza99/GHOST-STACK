/**
 * Express middleware for @ghoststack/node.
 *
 * Implements:
 * 1. Safe route capture and timing for incoming Express requests.
 * 2. W3C trace context extraction from incoming headers.
 * 3. Prevention of double-instrumentation: binds coherently to existing
 *    HTTP server span if present rather than spawning duplicate spans.
 * 4. Idempotent registration: safe if registered multiple times.
 */

const { parseTraceparent, runWithSpan } = require('../traceContext');
const { sanitizePath } = require('../sanitization');
const { GHOSTSTACK_SERVER_SPAN } = require('./http');

const GHOSTSTACK_EXPRESS_ATTACHED = Symbol('ghoststack.express_attached');

/**
 * Creates Express middleware for GhostStack telemetry.
 *
 * @param {import('../GhostStackClient')} client
 * @returns {import('express').RequestHandler}
 */
function createExpressMiddleware(client) {
  return function ghoststackExpressMiddleware(req, res, next) {
    if (client.config.disabled) {
      return next();
    }

    // Prevent repeated middleware execution on the same request
    if (req[GHOSTSTACK_EXPRESS_ATTACHED]) {
      return next();
    }
    req[GHOSTSTACK_EXPRESS_ATTACHED] = true;

    // Check if an HTTP server span was already created by HTTP server instrumentation
    const existingSpan = req[GHOSTSTACK_SERVER_SPAN];

    if (existingSpan) {
      // Enrich existing span with Express route template once route matches
      res.on('finish', () => {
        const route = resolveExpressRoute(req);
        if (route) {
          existingSpan.setAttribute('http.route', route);
          existingSpan.name = `${req.method.toUpperCase()} ${route}`;
        }
      });
      return runWithSpan(existingSpan, () => next());
    }

    // Express-only path: create SERVER span
    const incomingContext = parseTraceparent(req.headers ? req.headers['traceparent'] : null);
    const rawPath = req.originalUrl || req.url || '/';
    const cleanPath = sanitizePath(rawPath);
    const method = (req.method || 'GET').toUpperCase();

    const span = client.startSpan(`${method} ${cleanPath}`, {
      kind: 'SERVER',
      traceId: incomingContext ? incomingContext.traceId : undefined,
      parentSpanId: incomingContext ? incomingContext.parentId : undefined,
      attributes: {
        'http.method': method,
        'http.target': cleanPath,
      },
    });

    req[GHOSTSTACK_SERVER_SPAN] = span;

    res.on('finish', () => {
      const route = resolveExpressRoute(req);
      if (route) {
        span.setAttribute('http.route', route);
        span.name = `${method} ${route}`;
      }

      span.setAttribute('http.status_code', res.statusCode);

      if (res.statusCode >= 500) {
        span.setStatus({ code: 'ERROR', message: `HTTP ${res.statusCode}` });
      } else {
        span.setStatus({ code: 'OK' });
      }

      span.end();
    });

    return runWithSpan(span, () => next());
  };
}

/**
 * Resolves the Express route template (e.g. "/api/users/:id").
 */
function resolveExpressRoute(req) {
  if (req.route && req.route.path) {
    const base = req.baseUrl || '';
    const routePath = Array.isArray(req.route.path) ? req.route.path.join(',') : req.route.path;
    return `${base}${routePath}`;
  }
  return null;
}

module.exports = {
  createExpressMiddleware,
  GHOSTSTACK_EXPRESS_ATTACHED,
};
