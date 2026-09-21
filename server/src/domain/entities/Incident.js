const { v4: uuidv4 } = require('uuid');
const { ValidationError, InvalidStateError } = require('../errors');
const { validateSeverity } = require('../valueObjects/Severity');
const { validateIncidentStatus, isValidStatusTransition } = require('../valueObjects/IncidentStatus');

/**
 * Incident entity.
 *
 * Represents a detected or manually created incident.
 * Enforces status transition rules: detected → investigating → resolved.
 * Database-agnostic.
 */
class Incident {
  /**
   * @param {object} props
   * @param {string} [props.incidentId] - UUID (auto-generated if not provided)
   * @param {string} props.title - Incident title (required)
   * @param {string} [props.status] - One of: detected, investigating, resolved (default: detected)
   * @param {string} props.severity - One of: critical, high, medium, low (required)
   * @param {Date} [props.startedAt] - When the incident started
   * @param {Date} [props.endedAt] - When the incident was resolved
   * @param {object} [props.trigger] - What triggered the incident
   * @param {string[]} [props.affectedServices] - List of affected service IDs
   * @param {string[]} [props.events] - List of incident event IDs
   * @param {object} [props.metadata]
   */
  constructor(props) {
    if (!props) {
      throw new ValidationError('props', 'Incident properties are required');
    }
    if (!props.title || props.title.trim().length === 0) {
      throw new ValidationError('title', 'Incident title is required');
    }
    if (!props.severity) {
      throw new ValidationError('severity', 'Incident severity is required');
    }

    validateSeverity(props.severity);
    const status = props.status || 'detected';
    validateIncidentStatus(status);

    // endedAt is only valid for resolved incidents
    if (props.endedAt && status !== 'resolved') {
      throw new InvalidStateError('Incident', 'endedAt can only be set when status is resolved');
    }

    this.incidentId = props.incidentId || uuidv4();
    this.projectId = props.projectId || props.metadata?.projectId || 'project-default';
    this.title = props.title.trim();
    this.status = status;
    this.severity = props.severity;
    this.startedAt = props.startedAt instanceof Date ? props.startedAt : new Date();
    this.endedAt = props.endedAt instanceof Date ? props.endedAt : null;
    this.trigger = props.trigger ? { ...props.trigger } : null;
    this.affectedServices = Array.isArray(props.affectedServices) ? [...props.affectedServices] : [];
    this.events = Array.isArray(props.events) ? [...props.events] : [];
    this.metadata = props.metadata ? { ...props.metadata } : {};
  }

  /**
   * Transitions the incident to a new status.
   * Enforces valid transitions: detected → investigating → resolved.
   * @param {string} newStatus
   */
  transitionTo(newStatus) {
    validateIncidentStatus(newStatus);
    if (!isValidStatusTransition(this.status, newStatus)) {
      throw new InvalidStateError(
        'Incident',
        `Cannot transition from "${this.status}" to "${newStatus}"`
      );
    }
    this.status = newStatus;
    if (newStatus === 'resolved') {
      this.endedAt = new Date();
    }
  }

  /**
   * Adds a service ID to the list of affected services.
   * @param {string} serviceId
   */
  addAffectedService(serviceId) {
    if (!this.affectedServices.includes(serviceId)) {
      this.affectedServices.push(serviceId);
    }
  }

  /**
   * Adds an incident event ID.
   * @param {string} eventId
   */
  addEvent(eventId) {
    if (!this.events.includes(eventId)) {
      this.events.push(eventId);
    }
  }

  /**
   * Whether the incident is still active (not resolved).
   */
  isActive() {
    return this.status !== 'resolved';
  }

  /**
   * Returns the duration of the incident in milliseconds.
   * Returns null if the incident hasn't ended.
   */
  getDurationMs() {
    if (!this.endedAt) return null;
    return this.endedAt.getTime() - this.startedAt.getTime();
  }

  toJSON() {
    return {
      incidentId: this.incidentId,
      projectId: this.projectId,
      title: this.title,
      status: this.status,
      severity: this.severity,
      startedAt: this.startedAt.toISOString(),
      endedAt: this.endedAt ? this.endedAt.toISOString() : null,
      trigger: this.trigger ? { ...this.trigger } : null,
      affectedServices: [...this.affectedServices],
      events: [...this.events],
      durationMs: this.getDurationMs(),
      metadata: { ...this.metadata },
    };
  }
}

module.exports = Incident;
