/**
 * W3C Trace Context (Traceparent) parser, validator, and generator.
 *
 * Conforms strictly to W3C Trace Context Level 1 Recommendation:
 * - format: version-trace_id-parent_id-trace_flags
 * - version: 2 hex digits (00). Version 'ff' is forbidden.
 * - trace_id: 32 hex digits. All-zero is invalid.
 * - parent_id: 16 hex digits. All-zero is invalid.
 * - trace_flags: 2 hex digits (e.g. 01 for sampled, 00 for unsampled).
 */

const crypto = require('crypto');

const TRACEPARENT_REGEX = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i;
const ALL_ZERO_TRACE_ID = '00000000000000000000000000000000';
const ALL_ZERO_SPAN_ID = '0000000000000000';

/**
 * Validates and parses a W3C traceparent header string.
 * Returns null if invalid or malformed.
 *
 * @param {string} header
 * @returns {{
 *   version: string,
 *   traceId: string,
 *   parentId: string,
 *   traceFlags: string,
 *   sampled: boolean
 * } | null}
 */
function parseTraceparent(header) {
  if (!header || typeof header !== 'string') return null;

  const trimmed = header.trim();
  const match = trimmed.match(TRACEPARENT_REGEX);
  if (!match) return null;

  const version = match[1].toLowerCase();
  const traceId = match[2].toLowerCase();
  const parentId = match[3].toLowerCase();
  const traceFlags = match[4].toLowerCase();

  // W3C spec rule: version 'ff' is forbidden
  if (version === 'ff') return null;

  // W3C spec rule: all-zero traceId or parentId is forbidden
  if (traceId === ALL_ZERO_TRACE_ID || parentId === ALL_ZERO_SPAN_ID) {
    return null;
  }

  const flagsNum = parseInt(traceFlags, 16);
  const sampled = (flagsNum & 0x01) === 0x01;

  return {
    version,
    traceId,
    parentId,
    traceFlags,
    sampled,
  };
}

/**
 * Generates a cryptographically random 16-byte (32 hex characters) traceId.
 * Guarantees non-zero.
 *
 * @returns {string}
 */
function generateTraceId() {
  while (true) {
    const id = crypto.randomBytes(16).toString('hex');
    if (id !== ALL_ZERO_TRACE_ID) return id;
  }
}

/**
 * Generates a cryptographically random 8-byte (16 hex characters) spanId.
 * Guarantees non-zero.
 *
 * @returns {string}
 */
function generateSpanId() {
  while (true) {
    const id = crypto.randomBytes(8).toString('hex');
    if (id !== ALL_ZERO_SPAN_ID) return id;
  }
}

/**
 * Constructs a valid W3C traceparent string.
 *
 * @param {string} traceId
 * @param {string} spanId
 * @param {boolean} [sampled=true]
 * @returns {string}
 */
function formatTraceparent(traceId, spanId, sampled = true) {
  const flags = sampled ? '01' : '00';
  return `00-${traceId}-${spanId}-${flags}`;
}

/**
 * Safely injects W3C trace context into an outbound headers object without leaking credentials.
 *
 * @param {object} headers - Outgoing request headers map
 * @param {string} traceId
 * @param {string} spanId
 * @param {boolean} [sampled=true]
 * @returns {object} Updated headers
 */
function injectTraceContext(headers = {}, traceId, spanId, sampled = true) {
  if (!headers || typeof headers !== 'object') {
    headers = {};
  }
  headers['traceparent'] = formatTraceparent(traceId, spanId, sampled);
  return headers;
}

const { AsyncLocalStorage } = require('async_hooks');
const spanStorage = new AsyncLocalStorage();

/**
 * Returns the currently active span in the current async execution context.
 * @returns {import('./span').Span|null}
 */
function getActiveSpan() {
  return spanStorage.getStore() || null;
}

/**
 * Executes a function within the context of an active span.
 *
 * @template T
 * @param {import('./span').Span} span
 * @param {() => T} fn
 * @returns {T}
 */
function runWithSpan(span, fn) {
  return spanStorage.run(span, fn);
}

module.exports = {
  parseTraceparent,
  generateTraceId,
  generateSpanId,
  formatTraceparent,
  injectTraceContext,
  getActiveSpan,
  runWithSpan,
};
