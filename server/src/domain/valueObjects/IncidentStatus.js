const { InvalidEnumError } = require('../errors');

/**
 * Allowed incident statuses.
 *
 * - detected: system detected the incident automatically
 * - investigating: actively being investigated
 * - resolved: incident is resolved
 */
const INCIDENT_STATUSES = Object.freeze(['detected', 'investigating', 'resolved']);

/**
 * Valid status transitions.
 * Key: current status, Value: allowed next statuses.
 */
const STATUS_TRANSITIONS = Object.freeze({
  detected: ['investigating', 'resolved'],
  investigating: ['resolved'],
  resolved: [], // terminal state
});

/**
 * Validates and returns an incident status value.
 * @param {string} value
 * @returns {string} validated status
 * @throws {InvalidEnumError}
 */
function validateIncidentStatus(value) {
  if (!INCIDENT_STATUSES.includes(value)) {
    throw new InvalidEnumError('status', value, INCIDENT_STATUSES);
  }
  return value;
}

/**
 * Checks whether a status transition is valid.
 * @param {string} currentStatus
 * @param {string} newStatus
 * @returns {boolean}
 */
function isValidStatusTransition(currentStatus, newStatus) {
  const allowed = STATUS_TRANSITIONS[currentStatus];
  if (!allowed) return false;
  return allowed.includes(newStatus);
}

module.exports = {
  INCIDENT_STATUSES,
  STATUS_TRANSITIONS,
  validateIncidentStatus,
  isValidStatusTransition,
};
