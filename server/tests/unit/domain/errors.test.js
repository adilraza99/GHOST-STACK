const {
  DomainError,
  ValidationError,
  InvalidEnumError,
  InvalidStateError,
  EntityNotFoundError,
} = require('../../../src/domain/errors');

describe('Domain Errors', () => {
  describe('DomainError', () => {
    it('should be an instance of Error', () => {
      const err = new DomainError('test');
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(DomainError);
      expect(err.message).toBe('test');
      expect(err.code).toBe('DOMAIN_ERROR');
      expect(err.name).toBe('DomainError');
    });

    it('should accept a custom code', () => {
      const err = new DomainError('test', 'CUSTOM_CODE');
      expect(err.code).toBe('CUSTOM_CODE');
    });
  });

  describe('ValidationError', () => {
    it('should include field information', () => {
      const err = new ValidationError('name', 'Name is required');
      expect(err).toBeInstanceOf(DomainError);
      expect(err.name).toBe('ValidationError');
      expect(err.field).toBe('name');
      expect(err.code).toBe('VALIDATION_ERROR');
      expect(err.message).toBe('Name is required');
    });

    it('should generate default message', () => {
      const err = new ValidationError('email');
      expect(err.message).toContain('email');
    });
  });

  describe('InvalidEnumError', () => {
    it('should include value and allowed values', () => {
      const err = new InvalidEnumError('status', 'pending', ['active', 'resolved']);
      expect(err).toBeInstanceOf(DomainError);
      expect(err.name).toBe('InvalidEnumError');
      expect(err.field).toBe('status');
      expect(err.value).toBe('pending');
      expect(err.allowedValues).toEqual(['active', 'resolved']);
      expect(err.message).toContain('pending');
      expect(err.message).toContain('active');
    });
  });

  describe('InvalidStateError', () => {
    it('should include entity name', () => {
      const err = new InvalidStateError('Incident', 'cannot resolve');
      expect(err).toBeInstanceOf(DomainError);
      expect(err.name).toBe('InvalidStateError');
      expect(err.entity).toBe('Incident');
      expect(err.code).toBe('INVALID_STATE');
    });
  });

  describe('EntityNotFoundError', () => {
    it('should include entity type and ID', () => {
      const err = new EntityNotFoundError('Service', 'uuid-123');
      expect(err).toBeInstanceOf(DomainError);
      expect(err.name).toBe('EntityNotFoundError');
      expect(err.entity).toBe('Service');
      expect(err.entityId).toBe('uuid-123');
      expect(err.message).toContain('Service');
      expect(err.message).toContain('uuid-123');
    });
  });
});
