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
   * @param {string} props.serviceId - UUID of the service being deployed (required)
   * @param {string} props.previousVersion - Version before deployment (required)
   * @param {string} props.newVersion - Version being deployed (required)
   * @param {Date|string} [props.deployedAt] - When the deployment occurred
   * @param {string} [props.environment] - Deployment environment
   * @param {object} [props.metadata]
   */
  constructor(props) {
    if (!props) {
      throw new ValidationError('props', 'Deployment properties are required');
    }
    if (!props.serviceId) {
      throw new ValidationError('serviceId', 'Service ID is required');
    }
    if (!props.previousVersion) {
      throw new ValidationError('previousVersion', 'Previous version is required');
    }
    if (!props.newVersion) {
      throw new ValidationError('newVersion', 'New version is required');
    }
    if (props.previousVersion === props.newVersion) {
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
    this.serviceId = props.serviceId;
    this.previousVersion = props.previousVersion;
    this.newVersion = props.newVersion;
    this.deployedAt = deployedAt;
    this.environment = props.environment || null;
    this.metadata = props.metadata ? { ...props.metadata } : {};
  }

  toJSON() {
    return {
      deploymentId: this.deploymentId,
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
