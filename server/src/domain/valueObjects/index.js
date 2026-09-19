const { DEPENDENCY_TYPES, validateDependencyType } = require('./DependencyType');
const { SEVERITY_LEVELS, validateSeverity } = require('./Severity');
const { INCIDENT_STATUSES, STATUS_TRANSITIONS, validateIncidentStatus, isValidStatusTransition } = require('./IncidentStatus');
const { INCIDENT_EVENT_TYPES, validateIncidentEventType } = require('./IncidentEventType');

module.exports = {
  DEPENDENCY_TYPES,
  validateDependencyType,
  SEVERITY_LEVELS,
  validateSeverity,
  INCIDENT_STATUSES,
  STATUS_TRANSITIONS,
  validateIncidentStatus,
  isValidStatusTransition,
  INCIDENT_EVENT_TYPES,
  validateIncidentEventType,
};
