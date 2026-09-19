const { InvalidEnumError } = require('../errors');

/**
 * Allowed dependency types between services.
 *
 * - sync: synchronous HTTP/gRPC calls
 * - async: message queues, event-driven
 * - database: database connections
 * - external: third-party external services
 */
const DEPENDENCY_TYPES = Object.freeze(['sync', 'async', 'database', 'external']);

/**
 * Validates and returns a dependency type value.
 * @param {string} value
 * @returns {string} validated dependency type
 * @throws {InvalidEnumError}
 */
function validateDependencyType(value) {
  if (!DEPENDENCY_TYPES.includes(value)) {
    throw new InvalidEnumError('dependencyType', value, DEPENDENCY_TYPES);
  }
  return value;
}

module.exports = { DEPENDENCY_TYPES, validateDependencyType };
