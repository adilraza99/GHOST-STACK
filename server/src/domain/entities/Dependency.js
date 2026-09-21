const { v4: uuidv4 } = require('uuid');
const { ValidationError } = require('../errors');
const { validateDependencyType } = require('../valueObjects/DependencyType');

/**
 * Dependency entity.
 *
 * Represents a directed edge between two services in the dependency graph.
 * Composite uniqueness: sourceServiceId + targetServiceId + dependencyType.
 * Database-agnostic.
 */
class Dependency {
  /**
   * @param {object} props
   * @param {string} [props.dependencyId] - UUID (auto-generated if not provided)
   * @param {string} props.sourceServiceId - UUID of the source service (required)
   * @param {string} props.targetServiceId - UUID of the target service (required)
   * @param {string} props.dependencyType - One of: sync, async, database, external (required)
   * @param {Date} [props.firstSeenAt]
   * @param {Date} [props.lastSeenAt]
   * @param {number} [props.requestCount] - Defaults to 0
   * @param {number} [props.failureCount] - Defaults to 0
   * @param {object} [props.metadata]
   */
  constructor(props) {
    if (!props) {
      throw new ValidationError('props', 'Dependency properties are required');
    }
    if (!props.sourceServiceId) {
      throw new ValidationError('sourceServiceId', 'Source service ID is required');
    }
    if (!props.targetServiceId) {
      throw new ValidationError('targetServiceId', 'Target service ID is required');
    }
    if (props.sourceServiceId === props.targetServiceId) {
      throw new ValidationError('targetServiceId', 'A service cannot depend on itself');
    }
    if (!props.dependencyType) {
      throw new ValidationError('dependencyType', 'Dependency type is required');
    }

    // Validates against allowed enum
    validateDependencyType(props.dependencyType);

    this.dependencyId = props.dependencyId || uuidv4();
    this.projectId = (props.projectId && typeof props.projectId === 'string' && props.projectId.trim().length > 0)
      ? props.projectId.trim()
      : 'project-default';
    this.sourceServiceId = props.sourceServiceId;
    this.targetServiceId = props.targetServiceId;
    this.dependencyType = props.dependencyType;
    this.firstSeenAt = props.firstSeenAt instanceof Date ? props.firstSeenAt : new Date();
    this.lastSeenAt = props.lastSeenAt instanceof Date ? props.lastSeenAt : new Date();
    this.requestCount = typeof props.requestCount === 'number' ? props.requestCount : 0;
    this.failureCount = typeof props.failureCount === 'number' ? props.failureCount : 0;
    this.metadata = props.metadata ? { ...props.metadata } : {};
  }

  /**
   * Records a new request through this dependency.
   * Increments requestCount, updates lastSeenAt.
   * @param {boolean} [failed=false] - Whether the request failed
   */
  recordRequest(failed = false) {
    this.requestCount += 1;
    if (failed) {
      this.failureCount += 1;
    }
    this.lastSeenAt = new Date();
  }

  /**
   * Returns the failure rate as a decimal (0-1).
   * Returns 0 if no requests have been recorded.
   */
  getFailureRate() {
    if (this.requestCount === 0) return 0;
    return this.failureCount / this.requestCount;
  }

  /**
   * Returns the composite key for uniqueness checks.
   */
  getCompositeKey() {
    return `${this.sourceServiceId}:${this.targetServiceId}:${this.dependencyType}`;
  }

  /**
   * Returns the project-scoped composite key.
   */
  getScopedKey() {
    return `${this.projectId}:${this.sourceServiceId}:${this.targetServiceId}:${this.dependencyType}`;
  }

  toJSON() {
    return {
      dependencyId: this.dependencyId,
      projectId: this.projectId,
      sourceServiceId: this.sourceServiceId,
      targetServiceId: this.targetServiceId,
      dependencyType: this.dependencyType,
      firstSeenAt: this.firstSeenAt.toISOString(),
      lastSeenAt: this.lastSeenAt.toISOString(),
      requestCount: this.requestCount,
      failureCount: this.failureCount,
      failureRate: this.getFailureRate(),
      metadata: { ...this.metadata },
    };
  }
}

module.exports = Dependency;
