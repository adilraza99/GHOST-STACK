const { v4: uuidv4 } = require('uuid');
const { ValidationError, InvalidEnumError } = require('../errors');

const ALLOWED_STATUSES = ['active', 'archived'];
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Project domain entity.
 *
 * Represents an isolated project boundary for telemetry, services, and API keys.
 * Pure domain entity — zero infrastructure or HTTP dependencies.
 */
class Project {
  /**
   * @param {object} props
   * @param {string} [props.projectId] - UUID identifier
   * @param {string} props.name - Project display name (required)
   * @param {string} props.slug - Unique URL-safe identifier (required)
   * @param {string} [props.description] - Description of the project
   * @param {string} [props.status='active'] - 'active' | 'archived'
   * @param {Date} [props.createdAt] - Creation timestamp
   * @param {Date} [props.updatedAt] - Last update timestamp
   */
  constructor(props) {
    if (!props) {
      throw new ValidationError('props', 'Project properties are required');
    }
    if (!props.name || typeof props.name !== 'string' || props.name.trim().length === 0) {
      throw new ValidationError('name', 'Project name is required');
    }
    if (props.name.trim().length > 100) {
      throw new ValidationError('name', 'Project name cannot exceed 100 characters');
    }

    if (!props.slug || typeof props.slug !== 'string' || props.slug.trim().length === 0) {
      throw new ValidationError('slug', 'Project slug is required');
    }
    const cleanSlug = props.slug.trim().toLowerCase();
    if (!SLUG_REGEX.test(cleanSlug)) {
      throw new ValidationError(
        'slug',
        'Project slug must consist only of lowercase alphanumeric characters and single hyphens'
      );
    }
    if (cleanSlug.length > 100) {
      throw new ValidationError('slug', 'Project slug cannot exceed 100 characters');
    }

    const status = props.status || 'active';
    if (!ALLOWED_STATUSES.includes(status)) {
      throw new InvalidEnumError('status', status, ALLOWED_STATUSES);
    }

    this.projectId = props.projectId ? props.projectId.trim() : uuidv4();
    this.name = props.name.trim();
    this.slug = cleanSlug;
    this.description = typeof props.description === 'string' ? props.description.trim() : '';
    this.status = status;
    this.createdAt = props.createdAt instanceof Date ? props.createdAt : (props.createdAt ? new Date(props.createdAt) : new Date());
    this.updatedAt = props.updatedAt instanceof Date ? props.updatedAt : (props.updatedAt ? new Date(props.updatedAt) : new Date());
  }

  /**
   * Helper to slugify a string into URL-safe format.
   * @param {string} text
   * @returns {string}
   */
  static slugify(text) {
    if (!text || typeof text !== 'string') return '';
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Returns whether the project is active.
   * @returns {boolean}
   */
  isActive() {
    return this.status === 'active';
  }

  /**
   * Returns whether the project is archived.
   * @returns {boolean}
   */
  isArchived() {
    return this.status === 'archived';
  }

  /**
   * Archives the project.
   * @param {Date} [now=new Date()]
   */
  archive(now = new Date()) {
    this.status = 'archived';
    this.updatedAt = now instanceof Date ? now : new Date(now);
  }

  /**
   * Updates mutable project properties.
   * @param {object} updates
   * @param {string} [updates.name]
   * @param {string} [updates.description]
   * @param {Date} [now=new Date()]
   */
  update({ name, description } = {}, now = new Date()) {
    if (name !== undefined) {
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        throw new ValidationError('name', 'Project name cannot be empty');
      }
      if (name.trim().length > 100) {
        throw new ValidationError('name', 'Project name cannot exceed 100 characters');
      }
      this.name = name.trim();
    }
    if (description !== undefined) {
      this.description = typeof description === 'string' ? description.trim() : '';
    }
    this.updatedAt = now instanceof Date ? now : new Date(now);
  }

  /**
   * Serializes project to plain JSON representation.
   */
  toJSON() {
    return {
      projectId: this.projectId,
      name: this.name,
      slug: this.slug,
      description: this.description,
      status: this.status,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
    };
  }
}

module.exports = Project;
