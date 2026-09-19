const { v4: uuidv4 } = require('uuid');
const { ValidationError } = require('../errors');
const { validateIncidentEventType } = require('../valueObjects/IncidentEventType');

/**
 * IncidentEvent entity.
 *
 * Represents a single event within an incident timeline.
 * Database-agnostic.
 */
class IncidentEvent {
  /**
   * @param {object} props
   * @param {string} [props.eventId] - UUID (auto-generated if not provided)
   * @param {string} props.incidentId - Parent incident UUID (required)
   * @param {Date|string} props.timestamp - When the event occurred (required)
   * @param {string} props.serviceId - Which service was affected (required)
   * @param {string} props.type - One of: error, latency_spike, deployment, dependency_failure (required)
   * @param {string} props.message - Human-readable description (required)
   * @param {object} [props.metadata]
   */
  constructor(props) {
    if (!props) {
      throw new ValidationError('props', 'IncidentEvent properties are required');
    }
    if (!props.incidentId) {
      throw new ValidationError('incidentId', 'Incident ID is required');
    }
    if (!props.serviceId) {
      throw new ValidationError('serviceId', 'Service ID is required');
    }
    if (!props.type) {
      throw new ValidationError('type', 'Event type is required');
    }
    if (!props.message || props.message.trim().length === 0) {
      throw new ValidationError('message', 'Event message is required');
    }

    // Validate type
    validateIncidentEventType(props.type);

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

    this.eventId = props.eventId || uuidv4();
    this.incidentId = props.incidentId;
    this.timestamp = timestamp;
    this.serviceId = props.serviceId;
    this.type = props.type;
    this.message = props.message.trim();
    this.metadata = props.metadata ? { ...props.metadata } : {};
  }

  toJSON() {
    return {
      eventId: this.eventId,
      incidentId: this.incidentId,
      timestamp: this.timestamp.toISOString(),
      serviceId: this.serviceId,
      type: this.type,
      message: this.message,
      metadata: { ...this.metadata },
    };
  }
}

module.exports = IncidentEvent;
