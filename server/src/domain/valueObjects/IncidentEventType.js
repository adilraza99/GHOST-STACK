const { InvalidEnumError } = require('../errors');

/**
 * Allowed types for incident events.
 *
 * - error: HTTP error response (e.g., 5xx)
 * - latency_spike: abnormal latency increase
 * - deployment: a deployment occurred
 * - dependency_failure: a dependency failed
 */
const INCIDENT_EVENT_TYPES = Object.freeze([
  'error',
  'latency_spike',
  'deployment',
  'dependency_failure',
]);

/**
 * Validates and returns an incident event type value.
 * @param {string} value
 * @returns {string} validated event type
 * @throws {InvalidEnumError}
 */
function validateIncidentEventType(value) {
  if (!INCIDENT_EVENT_TYPES.includes(value)) {
    throw new InvalidEnumError('type', value, INCIDENT_EVENT_TYPES);
  }
  return value;
}

module.exports = { INCIDENT_EVENT_TYPES, validateIncidentEventType };
