const { v4: uuidv4 } = require('uuid');
const { ValidationError } = require('../errors');

/**
 * Deployment entity.
 *
 * Represents a version deployment of a service.
 * Database-agnostic.
 */
class Deployment {
  /**
   * @param {object} props
   * @param {string} [props.deploymentId] - UUID (auto-generated if not provided)
   * @param {string} [props.projectId='project-default'] - Project boundary
   * @param {string} props.serviceId - UUID or name of the service being deployed (required)
   * @param {string|null} [props.previousVersion] - Version before deployment (null for first deployment)
   * @param {string} props.newVersion - Version being deployed (required)
   * @param {Date|string} [props.deployedAt] - When the deployment occurred
   * @param {string} [props.environment] - Deployment environment
   * @param {object} [props.metadata]
   */
  constructor(props) {
    if (!props) {
      throw new ValidationError('props', 'Deployment properties are required');
    }
    if (props.projectId !== undefined && (typeof props.projectId !== 'string' || props.projectId.trim().length === 0)) {
      throw new ValidationError('projectId', 'Project ID cannot be empty');
    }
    if (!props.serviceId || typeof props.serviceId !== 'string' || props.serviceId.trim().length === 0) {
      throw new ValidationError('serviceId', 'Service ID is required');
    }
    if (!props.newVersion || typeof props.newVersion !== 'string' || props.newVersion.trim().length === 0) {
      throw new ValidationError('newVersion', 'New version is required');
    }
    const prev = props.previousVersion !== undefined && props.previousVersion !== null
      ? String(props.previousVersion).trim()
      : null;
    const next = String(props.newVersion).trim();

    if (prev !== null && prev === next) {
      throw new ValidationError(
        'newVersion',
        'New version must be different from previous version'
      );
    }

    // Parse deployedAt
    let deployedAt;
    if (props.deployedAt instanceof Date) {
      deployedAt = props.deployedAt;
    } else if (props.deployedAt) {
      deployedAt = new Date(props.deployedAt);
      if (isNaN(deployedAt.getTime())) {
        throw new ValidationError('deployedAt', 'Invalid deployedAt timestamp');
      }
    } else {
      deployedAt = new Date();
    }

    this.deploymentId = props.deploymentId || uuidv4();
    this.projectId = props.projectId ? props.projectId.trim() : (props.metadata?.projectId || 'project-default');
    this.serviceId = props.serviceId.trim();
    this.previousVersion = prev;
    this.newVersion = next;
    this.deployedAt = deployedAt;
    this.environment = props.environment || null;
    this.metadata = props.metadata ? { ...props.metadata } : {};
  }

  toJSON() {
    return {
      deploymentId: this.deploymentId,
      projectId: this.projectId,
      serviceId: this.serviceId,
      previousVersion: this.previousVersion,
      newVersion: this.newVersion,
      deployedAt: this.deployedAt.toISOString(),
      environment: this.environment,
      metadata: { ...this.metadata },
    };
  }
}

module.exports = Deployment;
