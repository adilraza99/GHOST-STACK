/**
 * Configuration manager and validator for @ghoststack/node.
 *
 * Enforces:
 * 1. Deterministic precedence: options > environment variables.
 * 2. Strict endpoint resolution: distinguishes production from dev/test.
 * 3. Canonical endpoint normalization to /v1/traces without double slashes.
 * 4. Required configuration validation (serviceName, apiKey in production).
 * 5. Safe sampling bounds (0.0 to 1.0).
 */

class ConfigError extends Error {
  constructor(message) {
    super(`[@ghoststack/node] Configuration error: ${message}`);
    this.name = 'ConfigError';
  }
}

/**
 * Validates and normalizes user configuration.
 *
 * @param {object} [options={}]
 * @returns {object} Normalized configuration
 */
function resolveConfig(options = {}) {
  const env = process.env;

  // 1. Service Name (Required)
  const serviceName = (options.serviceName || env.GHOSTSTACK_SERVICE_NAME || '').trim();
  if (!serviceName) {
    throw new ConfigError('serviceName is required. Provide options.serviceName or set GHOSTSTACK_SERVICE_NAME.');
  }

  // 2. Environment
  const environment = (
    options.environment ||
    env.GHOSTSTACK_ENVIRONMENT ||
    env.NODE_ENV ||
    'production'
  ).trim();

  const isProduction = environment === 'production' || env.NODE_ENV === 'production';
  const isDevOrTest = environment === 'development' || environment === 'test' || env.NODE_ENV === 'development' || env.NODE_ENV === 'test';

  // 3. API Key
  const apiKey = (options.apiKey || env.GHOSTSTACK_API_KEY || '').trim();
  if (!apiKey && !options.disabled && isProduction) {
    throw new ConfigError('apiKey is required in production. Provide options.apiKey or set GHOSTSTACK_API_KEY.');
  }

  // 4. Endpoint Resolution & Normalization (Correction 1 & 2)
  let rawEndpoint = options.endpoint || env.GHOSTSTACK_ENDPOINT;

  if (!rawEndpoint) {
    if (isProduction && !options.disabled) {
      throw new ConfigError(
        'An explicit endpoint is required in production. Provide options.endpoint or set GHOSTSTACK_ENDPOINT. Localhost fallback is rejected in production.'
      );
    }
    // Local development/test fallback only
    rawEndpoint = 'http://localhost:3000';
  }

  const endpoint = normalizeEndpoint(rawEndpoint);

  // 5. Sampling Rate (0.0 to 1.0)
  let sampleRate = options.sampleRate !== undefined
    ? Number(options.sampleRate)
    : (env.GHOSTSTACK_SAMPLE_RATE !== undefined ? Number(env.GHOSTSTACK_SAMPLE_RATE) : 1.0);

  if (isNaN(sampleRate) || sampleRate < 0 || sampleRate > 1) {
    throw new ConfigError(`sampleRate must be a number between 0.0 and 1.0. Received: ${sampleRate}`);
  }

  const rawBufferSize = Number(options.maxBufferSize || env.GHOSTSTACK_MAX_BUFFER_SIZE) || 1000;
  const maxBufferSize = Math.max(1, Math.min(50000, rawBufferSize));
  const rawBatchSize = Number(options.batchSize || env.GHOSTSTACK_BATCH_SIZE) || 100;
  const batchSize = Math.max(1, Math.min(maxBufferSize, Math.min(1000, rawBatchSize)));
  const flushIntervalMs = Math.max(10, Number(options.flushIntervalMs || env.GHOSTSTACK_FLUSH_INTERVAL_MS) || 2000);
  const timeoutMs = Math.max(10, Number(options.timeoutMs || env.GHOSTSTACK_TIMEOUT_MS) || 3000);
  const maxRetries = Math.max(0, Math.min(10, options.maxRetries !== undefined ? Number(options.maxRetries) : 3));
  const maxRetryDelayMs = Math.max(10, Number(options.maxRetryDelayMs) || 10000);

  // 7. Flags
  const disabled = Boolean(options.disabled || env.GHOSTSTACK_DISABLED === 'true');
  const debug = Boolean(options.debug || env.GHOSTSTACK_DEBUG === 'true');
  const retainErrors = options.retainErrors !== undefined ? Boolean(options.retainErrors) : true;
  const serviceVersion = (options.serviceVersion || env.GHOSTSTACK_SERVICE_VERSION || '').trim() || null;

  return {
    serviceName,
    environment,
    serviceVersion,
    apiKey,
    endpoint,
    rawEndpoint,
    sampleRate,
    batchSize,
    flushIntervalMs,
    maxBufferSize,
    timeoutMs,
    maxRetries,
    maxRetryDelayMs,
    disabled,
    debug,
    retainErrors,
    isProduction,
    isDevOrTest,
  };
}

/**
 * Normalizes user-provided endpoint URL to the canonical /v1/traces OTLP path.
 *
 * Examples:
 *   "https://api.ghoststack.com" -> "https://api.ghoststack.com/v1/traces"
 *   "https://api.ghoststack.com/" -> "https://api.ghoststack.com/v1/traces"
 *   "https://api.ghoststack.com/v1/traces" -> "https://api.ghoststack.com/v1/traces"
 *   "https://api.ghoststack.com/api/otlp/v1/traces" -> "https://api.ghoststack.com/api/otlp/v1/traces"
 *
 * @param {string} raw
 * @returns {string} Normalized full URL
 */
function normalizeEndpoint(raw) {
  if (!raw || typeof raw !== 'string') {
    throw new ConfigError('Endpoint must be a valid URL string.');
  }

  let parsed;
  try {
    parsed = new URL(raw.trim());
  } catch (_err) {
    throw new ConfigError(`Invalid endpoint URL format: "${raw}"`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ConfigError(`Endpoint protocol must be http: or https:, got: ${parsed.protocol}`);
  }

  // Strip trailing slashes
  let pathname = parsed.pathname.replace(/\/+$/, '');

  // If path is root or empty, append /v1/traces
  if (!pathname || pathname === '') {
    pathname = '/v1/traces';
  } else if (pathname.endsWith('/v1/traces')) {
    // Already has /v1/traces (e.g. /v1/traces or /api/otlp/v1/traces)
    // Keep as is
  } else {
    // Append /v1/traces without double slashes
    pathname = `${pathname}/v1/traces`;
  }

  parsed.pathname = pathname;
  return parsed.toString();
}

module.exports = {
  resolveConfig,
  normalizeEndpoint,
  ConfigError,
};
