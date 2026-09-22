/**
 * Security and privacy sanitization module for @ghoststack/node.
 *
 * Implements:
 * 1. Case-insensitive header blocklist (Authorization, Cookie, etc.).
 * 2. Sensitive query parameter sanitization (token, api_key, password, etc.).
 * 3. URL credential stripping (user:pass@).
 * 4. Bounded attribute limits (max keys, string lengths, array lengths, depth).
 * 5. Sensitive attribute scrubbing.
 * 6. Stable dependency target identity normalization without dynamic IDs or paths.
 */

// Headers that must NEVER be recorded or propagated
const SENSITIVE_HEADERS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'proxy-authorization',
  'x-api-key',
  'x-ghoststack-key',
  'x-auth-token',
  'x-access-token',
  'x-refresh-token',
]);

// Sensitive key substring patterns (case-insensitive)
const SENSITIVE_KEY_PATTERN = /^(authorization|cookie|set-cookie|password|passwd|secret|token|api[-_]?key|access[-_]?token|refresh[-_]?token|private[-_]?key|client[-_]?secret|credential|session)$/i;
const SENSITIVE_PARAM_PATTERN = /(token|api[-_]?key|access[-_]?token|password|secret|auth|credential|session)/i;

// Attribute limits (Correction 9)
const LIMITS = {
  maxAttributes: 64,
  maxKeyLength: 128,
  maxStringLength: 1024,
  maxArrayLength: 32,
  maxDepth: 3,
  maxTotalSize: 16384, // 16KB
};

/**
 * Checks whether an HTTP header name is sensitive.
 *
 * @param {string} name
 * @returns {boolean}
 */
function isSensitiveHeader(name) {
  if (!name || typeof name !== 'string') return false;
  return SENSITIVE_HEADERS.has(name.trim().toLowerCase());
}

/**
 * Filters and sanitizes an HTTP headers object.
 *
 * @param {object} headers
 * @returns {object} Sanitized headers
 */
function sanitizeHeaders(headers) {
  if (!headers || typeof headers !== 'object') return {};
  const result = {};
  for (const [rawKey, val] of Object.entries(headers)) {
    if (!rawKey || isSensitiveHeader(rawKey)) continue;
    const cleanKey = String(rawKey).trim().toLowerCase();
    result[cleanKey] = String(val).slice(0, LIMITS.maxStringLength);
  }
  return result;
}

/**
 * Sanitizes a URL string by:
 * 1. Stripping user credentials (user:pass@).
 * 2. Redacting sensitive query parameters (token, api_key, password, etc.).
 *
 * @param {string} rawUrl
 * @returns {string} Sanitized URL
 */
function sanitizeUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';

  try {
    const parsed = new URL(rawUrl);

    // 1. Remove user and password
    parsed.username = '';
    parsed.password = '';

    // 2. Redact sensitive query parameters
    const searchParams = parsed.searchParams;
    const keys = Array.from(searchParams.keys());

    for (const key of keys) {
      if (SENSITIVE_PARAM_PATTERN.test(key)) {
        searchParams.set(key, '[REDACTED]');
      }
    }

    return parsed.toString();
  } catch (_err) {
    // If rawUrl is a relative path (e.g. "/api/pay?token=xyz")
    return sanitizePath(rawUrl);
  }
}

/**
 * Sanitizes a relative URL path and query string.
 *
 * @param {string} rawPath
 * @returns {string}
 */
function sanitizePath(rawPath) {
  if (!rawPath || typeof rawPath !== 'string') return '';

  const qIdx = rawPath.indexOf('?');
  if (qIdx === -1) {
    return rawPath.slice(0, LIMITS.maxStringLength);
  }

  const pathOnly = rawPath.slice(0, qIdx);
  const queryStr = rawPath.slice(qIdx + 1);

  try {
    const params = new URLSearchParams(queryStr);
    const keys = Array.from(params.keys());
    for (const key of keys) {
      if (SENSITIVE_PARAM_PATTERN.test(key)) {
        params.set(key, '[REDACTED]');
      }
    }
    const cleanQuery = params.toString();
    return cleanQuery ? `${pathOnly}?${cleanQuery}` : pathOnly;
  } catch (_err) {
    return pathOnly;
  }
}

/**
 * Normalizes an outgoing HTTP destination to a stable service / dependency identity.
 * Strips paths, dynamic IDs, query strings, and credentials.
 *
 * @param {string|object} input - URL string or http.request options
 * @returns {string|null} Stable target service identity
 */
function normalizeTargetService(input) {
  if (!input) return null;

  let host = null;

  if (typeof input === 'string') {
    let str = input.trim();
    if (!/^https?:\/\//i.test(str)) {
      str = `http://${str}`;
    }
    try {
      const parsed = new URL(str);
      host = parsed.host; // e.g. "payment-service.internal:8080" or "payment-service.internal"
    } catch (_err) {
      // Fallback string extraction
      const match = input.match(/^(?:https?:\/\/)?(?:[^@]+@)?([^/?#]+)/i);
      if (match) host = match[1];
    }
  } else if (typeof input === 'object') {
    if (input.hostname) {
      host = input.port ? `${input.hostname}:${input.port}` : input.hostname;
    } else if (input.host) {
      host = input.host;
    }
  }

  if (!host) return null;

  // Clean username/pass if present in host string
  const atIdx = host.indexOf('@');
  if (atIdx !== -1) {
    host = host.slice(atIdx + 1);
  }

  return host.trim().toLowerCase() || null;
}

/**
 * Sanitizes, bounds, and scrubs a dictionary of span attributes.
 *
 * Enforces:
 * - maxAttributes limit (64)
 * - maxKeyLength limit (128)
 * - maxStringLength limit (1024)
 * - maxArrayLength limit (32)
 * - maxDepth limit (3)
 * - sensitive key scrubbing ('[REDACTED]')
 *
 * @param {object} attrs
 * @param {object} [stats] - Optional SDKStats to record truncation
 * @returns {object} Clean sanitized attributes
 */
function sanitizeAttributes(attrs, stats = null) {
  if (!attrs || typeof attrs !== 'object') return {};

  const sanitized = {};
  let attrCount = 0;

  for (const [key, val] of Object.entries(attrs)) {
    if (attrCount >= LIMITS.maxAttributes) {
      if (stats) stats.recordAttributeTruncated();
      break;
    }

    if (!key || typeof key !== 'string') continue;

    const cleanKey = key.trim().slice(0, LIMITS.maxKeyLength);

    // Scrub sensitive keys
    if (SENSITIVE_KEY_PATTERN.test(cleanKey) || SENSITIVE_PARAM_PATTERN.test(cleanKey)) {
      sanitized[cleanKey] = '[REDACTED]';
      attrCount++;
      continue;
    }

    sanitized[cleanKey] = sanitizeValue(val, 0, stats);
    attrCount++;
  }

  return sanitized;
}

function sanitizeValue(val, depth = 0, stats = null) {
  if (val === null || val === undefined) return null;

  const type = typeof val;

  if (type === 'string') {
    if (val.length > LIMITS.maxStringLength) {
      if (stats) stats.recordAttributeTruncated();
      return val.slice(0, LIMITS.maxStringLength);
    }
    return val;
  }

  if (type === 'number' || type === 'boolean') {
    return val;
  }

  if (type === 'bigint') {
    return val.toString();
  }

  if (depth >= LIMITS.maxDepth) {
    if (stats) stats.recordAttributeTruncated();
    return '[TRUNCATED_DEPTH]';
  }

  if (Array.isArray(val)) {
    const len = Math.min(val.length, LIMITS.maxArrayLength);
    if (val.length > LIMITS.maxArrayLength && stats) {
      stats.recordAttributeTruncated();
    }
    const arr = [];
    for (let i = 0; i < len; i++) {
      arr.push(sanitizeValue(val[i], depth + 1, stats));
    }
    return arr;
  }

  if (type === 'object') {
    // Avoid circular or complex prototypes
    const obj = {};
    let count = 0;
    for (const [k, v] of Object.entries(val)) {
      if (count >= 16) {
        if (stats) stats.recordAttributeTruncated();
        break;
      }
      const cleanKey = String(k).slice(0, 64);
      if (SENSITIVE_KEY_PATTERN.test(cleanKey)) {
        obj[cleanKey] = '[REDACTED]';
      } else {
        obj[cleanKey] = sanitizeValue(v, depth + 1, stats);
      }
      count++;
    }
    return obj;
  }

  return String(val).slice(0, LIMITS.maxStringLength);
}

module.exports = {
  isSensitiveHeader,
  sanitizeHeaders,
  sanitizeUrl,
  sanitizePath,
  normalizeTargetService,
  sanitizeAttributes,
  LIMITS,
};
