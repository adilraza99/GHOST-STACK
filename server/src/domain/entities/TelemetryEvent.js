const { v4: uuidv4 } = require('uuid');
const { ValidationError } = require('../errors');

/**
 * TelemetryEvent entity.
 *
 * Represents a single observed interaction between services.
 * Required fields: sourceService, timestamp.
 * All other fields are optional since not all telemetry sources provide them.
 * Database-agnostic.
 */
class TelemetryEvent {
  /**
   * @param {object} props
   * @param {string} [props.eventId] - UUID (auto-generated if not provided)
   * @param {Date|string} props.timestamp - Event timestamp (required)
   * @param {string} props.sourceService - Source service name (required)
   * @param {string} [props.targetService] - Target service name
   * @param {string} [props.endpoint] - Request endpoint path
   * @param {string} [props.method] - HTTP method
   * @param {number} [props.statusCode] - HTTP status code
   * @param {number} [props.latencyMs] - Request latency in milliseconds
   * @param {string} [props.traceId] - Distributed trace ID
   * @param {string} [props.requestId] - Individual request ID
   * @param {string} [props.environment] - Environment name
   * @param {object} [props.metadata] - Arbitrary metadata
   */
  constructor(props) {
    if (!props) {
      throw new ValidationError('props', 'TelemetryEvent properties are required');
    }
    if (!props.sourceService) {
      throw new ValidationError('sourceService', 'Source service is required');
    }

    // Parse and validate timestamp
    let timestamp;
    if (props.timestamp instanceof Date) {
      timestamp = props.timestamp;
    } else if (props.timestamp) {
      timestamp = new Date(props.timestamp);
    } else {
      throw new ValidationError('timestamp', 'Timestamp is required');
    }

    if (isNaN(timestamp.getTime())) {
      throw new ValidationError('timestamp', 'Invalid timestamp value');
    }

    // Validate statusCode if provided
    if (props.statusCode !== undefined && props.statusCode !== null) {
      const code = Number(props.statusCode);
      if (!Number.isInteger(code) || code < 100 || code > 599) {
        throw new ValidationError('statusCode', 'Status code must be between 100 and 599');
      }
    }

    // Validate latencyMs if provided
    if (props.latencyMs !== undefined && props.latencyMs !== null) {
      if (typeof props.latencyMs !== 'number' || props.latencyMs < 0) {
        throw new ValidationError('latencyMs', 'Latency must be a non-negative number');
      }
    }

    this.eventId = props.eventId || uuidv4();
    this.timestamp = timestamp;
    this.sourceService = props.sourceService.trim();
    this.targetService = props.targetService ? props.targetService.trim() : null;
    this.endpoint = props.endpoint || null;
    this.method = props.method ? props.method.toUpperCase() : null;
    this.statusCode = props.statusCode !== undefined ? Number(props.statusCode) : null;
    this.latencyMs = props.latencyMs !== undefined ? props.latencyMs : null;
    this.traceId = props.traceId || null;
    this.requestId = props.requestId || null;
    this.environment = props.environment || null;
    this.metadata = props.metadata ? { ...props.metadata } : {};
  }

  /**
   * Whether this event represents an error (5xx status).
   */
  isError() {
    return this.statusCode !== null && this.statusCode >= 500;
  }

  /**
   * Whether this event represents a client error (4xx status).
   */
  isClientError() {
    return this.statusCode !== null && this.statusCode >= 400 && this.statusCode < 500;
  }

  /**
   * Whether this event has a target service (i.e., represents a dependency call).
   */
  hasDependency() {
    return this.targetService !== null;
  }

  toJSON() {
    return {
      eventId: this.eventId,
      timestamp: this.timestamp.toISOString(),
      sourceService: this.sourceService,
      targetService: this.targetService,
      endpoint: this.endpoint,
      method: this.method,
      statusCode: this.statusCode,
      latencyMs: this.latencyMs,
      traceId: this.traceId,
      requestId: this.requestId,
      environment: this.environment,
      metadata: { ...this.metadata },
    };
  }
}

module.exports = TelemetryEvent;
