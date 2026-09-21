/**
 * Base class for all domain-level errors.
 * Domain errors represent violations of business rules and invariants.
 * They carry NO infrastructure dependencies.
 */
class DomainError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'DomainError';
    this.code = code || 'DOMAIN_ERROR';
  }
}

/**
 * Thrown when a required field is missing or empty.
 */
class ValidationError extends DomainError {
  constructor(field, message) {
    super(message || `Validation failed for field: ${field}`, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
    this.field = field;
  }
}

/**
 * Thrown when a provided value is not in the set of allowed values.
 */
class InvalidEnumError extends DomainError {
  constructor(field, value, allowedValues) {
    super(
      `Invalid value "${value}" for ${field}. Allowed: ${allowedValues.join(', ')}`,
      'INVALID_ENUM'
    );
    this.name = 'InvalidEnumError';
    this.field = field;
    this.value = value;
    this.allowedValues = allowedValues;
  }
}

/**
 * Thrown when an entity is in an invalid state for the requested operation.
 */
class InvalidStateError extends DomainError {
  constructor(entity, message) {
    super(`Invalid state for ${entity}: ${message}`, 'INVALID_STATE');
    this.name = 'InvalidStateError';
    this.entity = entity;
  }
}

/**
 * Thrown when a requested entity is not found.
 */
class EntityNotFoundError extends DomainError {
  constructor(entity, id) {
    super(`${entity} not found: ${id}`, 'ENTITY_NOT_FOUND');
    this.name = 'EntityNotFoundError';
    this.entity = entity;
    this.entityId = id;
  }
}

/**
 * Thrown when an authentication attempt fails or credentials are missing/invalid.
 */
class UnauthorizedError extends DomainError {
  constructor(message = 'Unauthorized') {
    super(message, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

/**
 * Thrown when an authenticated client attempts an operation without sufficient permission or cross-project access.
 */
class ForbiddenError extends DomainError {
  constructor(message = 'Forbidden') {
    super(message, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

/**
 * Thrown when an entity creation conflicts with an existing unique field (e.g. duplicate slug).
 */
class ConflictError extends DomainError {
  constructor(message = 'Conflict') {
    super(message, 'CONFLICT');
    this.name = 'ConflictError';
  }
}

module.exports = {
  DomainError,
  ValidationError,
  InvalidEnumError,
  InvalidStateError,
  EntityNotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
};

