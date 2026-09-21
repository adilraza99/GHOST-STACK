const { v4: uuidv4 } = require('uuid');
const { ValidationError } = require('../errors');

/**
 * Service entity.
 *
 * Represents an application service in the dependency graph.
 * Database-agnostic — uses UUID identifiers, no Mongoose/MongoDB.
 */
class Service {
  /**
   * @param {object} props
   * @param {string} [props.serviceId] - UUID (auto-generated if not provided)
   * @param {string} props.name - Service name (required)
   * @param {string} [props.environment] - Environment (e.g., 'production', 'demo')
   * @param {string} [props.version] - Service version
   * @param {object} [props.metadata] - Arbitrary metadata
   * @param {Date} [props.createdAt]
   * @param {Date} [props.updatedAt]
   */
  constructor(props) {
    if (!props || !props.name) {
      throw new ValidationError('name', 'Service name is required');
    }

    const trimmedName = props.name.trim();
    if (trimmedName.length === 0) {
      throw new ValidationError('name', 'Service name cannot be empty');
    }

    this.serviceId = props.serviceId || uuidv4();
    this.projectId = (props.projectId && typeof props.projectId === 'string' && props.projectId.trim().length > 0)
      ? props.projectId.trim()
      : 'project-default';
    this.name = trimmedName;
    this.environment = props.environment || null;
    this.version = props.version || null;
    this.metadata = props.metadata ? { ...props.metadata } : {};
    this.createdAt = props.createdAt instanceof Date ? props.createdAt : new Date();
    this.updatedAt = props.updatedAt instanceof Date ? props.updatedAt : new Date();
  }

  /**
   * Updates service fields. Only updates fields that are provided.
   * @param {object} updates
   */
  update(updates) {
    if (updates.name !== undefined) {
      const trimmed = updates.name.trim();
      if (trimmed.length === 0) {
        throw new ValidationError('name', 'Service name cannot be empty');
      }
      this.name = trimmed;
    }
    if (updates.projectId !== undefined && typeof updates.projectId === 'string' && updates.projectId.trim().length > 0) {
      this.projectId = updates.projectId.trim();
    }
    if (updates.environment !== undefined) this.environment = updates.environment;
    if (updates.version !== undefined) this.version = updates.version;
    if (updates.metadata !== undefined) this.metadata = { ...updates.metadata };
    this.updatedAt = new Date();
  }

  /**
   * Returns a plain object representation (for serialization).
   */
  toJSON() {
    return {
      serviceId: this.serviceId,
      projectId: this.projectId,
      name: this.name,
      environment: this.environment,
      version: this.version,
      metadata: { ...this.metadata },
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
    };
  }
}

module.exports = Service;
