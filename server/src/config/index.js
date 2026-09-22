const dotenv = require('dotenv');
const path = require('path');

// Load .env from server directory
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const config = {
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/ghoststack',
  logLevel: process.env.LOG_LEVEL || 'info',

  isDevelopment() {
    return this.nodeEnv === 'development';
  },

  isProduction() {
    return this.nodeEnv === 'production';
  },

  isTest() {
    return this.nodeEnv === 'test';
  },

  // Incident detection thresholds (configurable, no magic numbers)
  incidents: {
    errorRateThreshold: parseFloat(process.env.ERROR_RATE_THRESHOLD) || 0.5,
    latencyThresholdMs: parseInt(process.env.LATENCY_THRESHOLD_MS, 10) || 5000,
    minimumEvents: parseInt(process.env.MINIMUM_EVENTS, 10) || 5,
    timeWindowMs: parseInt(process.env.TIME_WINDOW_MS, 10) || 60000,
  },

  // Rate limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000,
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX, 10) || 200,
  },

  // OpenTelemetry (OTLP) configuration
  otlp: {
    maxSpansPerRequest: parseInt(process.env.OTLP_MAX_SPANS, 10) || 1000,
    bodyLimit: process.env.OTLP_BODY_LIMIT || '2mb',
  },
};

/**
 * Validates that required configuration is present.
 * Throws if critical config is missing or invalid.
 */
function validateConfig() {
  const errors = [];

  if (!config.mongoUri) {
    errors.push('MONGO_URI is required');
  }

  if (config.port < 1 || config.port > 65535) {
    errors.push(`PORT must be between 1 and 65535, got: ${config.port}`);
  }

  const validLogLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'];
  if (!validLogLevels.includes(config.logLevel)) {
    errors.push(`LOG_LEVEL must be one of: ${validLogLevels.join(', ')}, got: ${config.logLevel}`);
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n  - ${errors.join('\n  - ')}`);
  }
}

module.exports = { config, validateConfig };
