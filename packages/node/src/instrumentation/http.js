/**
 * Non-destructive HTTP & HTTPS client/server instrumentation for @ghoststack/node.
 *
 * Implements:
 * 1. Outgoing client call dependency tracking (CLIENT spans).
 * 2. Strict prevention of self-instrumentation (ignores requests to GHOST-STACK endpoint).
 * 3. W3C traceparent injection on outgoing requests without credential leakage.
 * 4. Incoming HTTP request tracking (SERVER spans) with symbol tagging.
 * 5. Reversible, idempotent patching (can be un-instrumented cleanly).
 */

const http = require('http');
const https = require('https');
const { parseTraceparent, injectTraceContext } = require('../traceContext');
const { normalizeTargetService, sanitizePath, sanitizeUrl } = require('../sanitization');

const GHOSTSTACK_SERVER_SPAN = Symbol('ghoststack.server_span');
const GHOSTSTACK_CLIENT_SPAN = Symbol('ghoststack.client_span');

let originalHttpRequest = null;
let originalHttpGet = null;
let originalHttpsRequest = null;
let originalHttpsGet = null;
let activeClients = new Set();

/**
 * Checks whether an outbound request is destined for GHOST-STACK's own endpoint
 * or contains the internal SDK marker header.
 *
 * @param {object} options
 * @param {string} ghoststackEndpoint
 * @returns {boolean}
 */
function isInternalOrSelfRequest(options, ghoststackEndpoint) {
  if (!options) return false;

  // 1. Check internal marker header
  const headers = options.headers || {};
  if (headers['X-GhostStack-Internal'] || headers['x-ghoststack-internal']) {
    return true;
  }

  // 2. Check destination against configured GHOST-STACK endpoint
  try {
    const epUrl = new URL(ghoststackEndpoint);
    const reqHost = options.hostname || options.host;
    const reqPort = options.port || (options.protocol === 'https:' ? 443 : 80);
    const epPort = epUrl.port || (epUrl.protocol === 'https:' ? 443 : 80);

    if (reqHost && reqHost.toLowerCase() === epUrl.hostname.toLowerCase() && String(reqPort) === String(epPort)) {
      return true;
    }
  } catch (_err) {
    // If endpoint parsing fails, fall back to safe check
  }

  return false;
}

/**
 * Enables HTTP and HTTPS client instrumentation.
 * Idempotent: can be called multiple times safely.
 *
 * @param {import('../GhostStackClient')} client
 */
function instrumentHttp(client) {
  activeClients.add(client);

  if (originalHttpRequest) {
    return; // Already patched
  }

  originalHttpRequest = http.request;
  originalHttpGet = http.get;
  originalHttpsRequest = https.request;
  originalHttpsGet = https.get;

  // Patch http.request
  http.request = function ghoststackPatchedHttpRequest(...args) {
    return wrapClientRequest(client, originalHttpRequest, 'http:', ...args);
  };

  // Patch http.get
  http.get = function ghoststackPatchedHttpGet(...args) {
    const req = http.request(...args);
    req.end();
    return req;
  };

  // Patch https.request
  https.request = function ghoststackPatchedHttpsRequest(...args) {
    return wrapClientRequest(client, originalHttpsRequest, 'https:', ...args);
  };

  // Patch https.get
  https.get = function ghoststackPatchedHttpsGet(...args) {
    const req = https.request(...args);
    req.end();
    return req;
  };
}

/**
 * Reverts HTTP and HTTPS instrumentation.
 *
 * @param {import('../GhostStackClient')} [client]
 */
function uninstrumentHttp(client) {
  if (client) {
    activeClients.delete(client);
  } else {
    activeClients.clear();
  }

  if (activeClients.size === 0 && originalHttpRequest) {
    http.request = originalHttpRequest;
    http.get = originalHttpGet;
    https.request = originalHttpsRequest;
    https.get = originalHttpsGet;
    originalHttpRequest = null;
    originalHttpGet = null;
    originalHttpsRequest = null;
    originalHttpsGet = null;
  }
}

/**
 * Wraps an outgoing HTTP/HTTPS client request.
 */
function wrapClientRequest(client, originalFn, defaultProtocol, ...args) {
  let urlStr = null;
  let options = {};
  let cb = null;

  if (typeof args[0] === 'string' || args[0] instanceof URL) {
    urlStr = args[0].toString();
    if (typeof args[1] === 'object') {
      options = { ...args[1] };
      cb = typeof args[2] === 'function' ? args[2] : null;
    } else if (typeof args[1] === 'function') {
      cb = args[1];
    }
  } else if (typeof args[0] === 'object') {
    options = { ...args[0] };
    cb = typeof args[1] === 'function' ? args[1] : null;
  }

  if (!options.headers) {
    options.headers = {};
  }

  // Strictly prevent self-instrumentation (Correction 3)
  if (client.config.disabled || isInternalOrSelfRequest(options, client.config.endpoint)) {
    return originalFn.apply(this, args);
  }

  // Resolve stable targetService (Correction 11)
  const targetService = normalizeTargetService(urlStr || options);
  const method = (options.method || 'GET').toUpperCase();
  const rawPath = options.path || (urlStr ? new URL(urlStr).pathname : '/');
  const endpoint = sanitizePath(rawPath);

  const span = client.startSpan(`${method} ${endpoint}`, {
    kind: 'CLIENT',
    targetService,
    attributes: {
      'http.method': method,
      'http.url': urlStr ? sanitizeUrl(urlStr) : endpoint,
    },
  });

  // Inject W3C traceparent into outgoing headers (Correction 6)
  injectTraceContext(options.headers, span.traceId, span.spanId, true);

  // Re-assemble arguments
  let newArgs;
  if (urlStr) {
    newArgs = cb ? [urlStr, options, cb] : [urlStr, options];
  } else {
    newArgs = cb ? [options, cb] : [options];
  }

  const req = originalFn.apply(this, newArgs);
  req[GHOSTSTACK_CLIENT_SPAN] = span;

  req.on('response', (res) => {
    span.setAttribute('http.status_code', res.statusCode);
    if (res.statusCode >= 500) {
      span.setStatus({ code: 'ERROR', message: `HTTP ${res.statusCode}` });
    } else {
      span.setStatus({ code: 'OK' });
    }
    span.end();
  });

  req.on('error', (err) => {
    span.recordError(err);
    span.end();
  });

  return req;
}

module.exports = {
  instrumentHttp,
  uninstrumentHttp,
  isInternalOrSelfRequest,
  GHOSTSTACK_SERVER_SPAN,
  GHOSTSTACK_CLIENT_SPAN,
};
