const { InvalidEnumError } = require('../errors');

/**
 * Allowed severity levels for incidents.
 * Ordered from most to least severe.
 */
const SEVERITY_LEVELS = Object.freeze(['critical', 'high', 'medium', 'low']);

/**
 * Validates and returns a severity value.
 * @param {string} value
 * @returns {string} validated severity
 * @throws {InvalidEnumError}
 */
function validateSeverity(value) {
  if (!SEVERITY_LEVELS.includes(value)) {
    throw new InvalidEnumError('severity', value, SEVERITY_LEVELS);
  }
  return value;
}

module.exports = { SEVERITY_LEVELS, validateSeverity };
