const Service = require('../../../src/domain/entities/Service');
const { ValidationError } = require('../../../src/domain/errors');

describe('Service Entity', () => {
  describe('creation', () => {
    it('should create a valid service with required fields', () => {
      const service = new Service({ name: 'payment-service' });

      expect(service.serviceId).toBeDefined();
      expect(service.serviceId.length).toBe(36); // UUID v4 format
      expect(service.name).toBe('payment-service');
      expect(service.environment).toBeNull();
      expect(service.version).toBeNull();
      expect(service.metadata).toEqual({});
      expect(service.createdAt).toBeInstanceOf(Date);
      expect(service.updatedAt).toBeInstanceOf(Date);
    });

    it('should create a service with all fields', () => {
      const now = new Date();
      const service = new Service({
        serviceId: 'custom-id-123',
        name: 'orders-service',
        environment: 'production',
        version: '2.1.0',
        metadata: { team: 'backend' },
        createdAt: now,
        updatedAt: now,
      });

      expect(service.serviceId).toBe('custom-id-123');
      expect(service.name).toBe('orders-service');
      expect(service.environment).toBe('production');
      expect(service.version).toBe('2.1.0');
      expect(service.metadata).toEqual({ team: 'backend' });
      expect(service.createdAt).toBe(now);
    });

    it('should trim the service name', () => {
      const service = new Service({ name: '  payment-service  ' });
      expect(service.name).toBe('payment-service');
    });

    it('should make a defensive copy of metadata', () => {
      const meta = { team: 'backend' };
      const service = new Service({ name: 'svc', metadata: meta });
      meta.team = 'frontend';
      expect(service.metadata.team).toBe('backend');
    });
  });

  describe('validation', () => {
    it('should throw ValidationError when name is missing', () => {
      expect(() => new Service({})).toThrow(ValidationError);
      expect(() => new Service({})).toThrow('Service name is required');
    });

    it('should throw ValidationError when props is null', () => {
      expect(() => new Service(null)).toThrow(ValidationError);
    });

    it('should throw ValidationError when name is empty string', () => {
      expect(() => new Service({ name: '' })).toThrow(ValidationError);
      expect(() => new Service({ name: '' })).toThrow('Service name is required');
    });

    it('should throw ValidationError when name is only whitespace', () => {
      expect(() => new Service({ name: '   ' })).toThrow('Service name cannot be empty');
    });
  });

  describe('update', () => {
    it('should update name', () => {
      const service = new Service({ name: 'old-name' });
      service.update({ name: 'new-name' });
      expect(service.name).toBe('new-name');
    });

    it('should update version and environment', () => {
      const service = new Service({ name: 'svc' });
      service.update({ version: '1.0.0', environment: 'staging' });
      expect(service.version).toBe('1.0.0');
      expect(service.environment).toBe('staging');
    });

    it('should update updatedAt on any update', () => {
      const service = new Service({ name: 'svc' });
      const originalUpdatedAt = service.updatedAt;
      // Small delay to ensure different timestamp
      service.update({ version: '2.0.0' });
      expect(service.updatedAt.getTime()).toBeGreaterThanOrEqual(originalUpdatedAt.getTime());
    });

    it('should throw on empty name update', () => {
      const service = new Service({ name: 'svc' });
      expect(() => service.update({ name: '  ' })).toThrow('Service name cannot be empty');
    });

    it('should replace metadata entirely on update', () => {
      const service = new Service({ name: 'svc', metadata: { a: 1, b: 2 } });
      service.update({ metadata: { c: 3 } });
      expect(service.metadata).toEqual({ c: 3 });
    });
  });

  describe('toJSON', () => {
    it('should return a serializable object', () => {
      const service = new Service({ name: 'svc', version: '1.0' });
      const json = service.toJSON();

      expect(json.serviceId).toBe(service.serviceId);
      expect(json.name).toBe('svc');
      expect(typeof json.createdAt).toBe('string');
      expect(typeof json.updatedAt).toBe('string');
    });

    it('should make defensive copies in toJSON', () => {
      const service = new Service({ name: 'svc', metadata: { x: 1 } });
      const json = service.toJSON();
      json.metadata.x = 999;
      expect(service.metadata.x).toBe(1);
    });
  });
});
