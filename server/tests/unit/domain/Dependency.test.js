const Dependency = require('../../../src/domain/entities/Dependency');
const { ValidationError, InvalidEnumError } = require('../../../src/domain/errors');

describe('Dependency Entity', () => {
  const validProps = {
    sourceServiceId: 'source-uuid-111',
    targetServiceId: 'target-uuid-222',
    dependencyType: 'sync',
  };

  describe('creation', () => {
    it('should create a valid dependency with required fields', () => {
      const dep = new Dependency(validProps);

      expect(dep.dependencyId).toBeDefined();
      expect(dep.dependencyId.length).toBe(36);
      expect(dep.sourceServiceId).toBe('source-uuid-111');
      expect(dep.targetServiceId).toBe('target-uuid-222');
      expect(dep.dependencyType).toBe('sync');
      expect(dep.requestCount).toBe(0);
      expect(dep.failureCount).toBe(0);
      expect(dep.firstSeenAt).toBeInstanceOf(Date);
      expect(dep.lastSeenAt).toBeInstanceOf(Date);
      expect(dep.metadata).toEqual({});
    });

    it('should accept all valid dependency types', () => {
      ['sync', 'async', 'database', 'external'].forEach((type) => {
        const dep = new Dependency({ ...validProps, dependencyType: type });
        expect(dep.dependencyType).toBe(type);
      });
    });

    it('should accept custom initial counts', () => {
      const dep = new Dependency({ ...validProps, requestCount: 10, failureCount: 2 });
      expect(dep.requestCount).toBe(10);
      expect(dep.failureCount).toBe(2);
    });
  });

  describe('validation', () => {
    it('should throw when props is null', () => {
      expect(() => new Dependency(null)).toThrow(ValidationError);
    });

    it('should throw when sourceServiceId is missing', () => {
      expect(() => new Dependency({ targetServiceId: 'x', dependencyType: 'sync' }))
        .toThrow('Source service ID is required');
    });

    it('should throw when targetServiceId is missing', () => {
      expect(() => new Dependency({ sourceServiceId: 'x', dependencyType: 'sync' }))
        .toThrow('Target service ID is required');
    });

    it('should throw when dependencyType is missing', () => {
      expect(() => new Dependency({ sourceServiceId: 'x', targetServiceId: 'y' }))
        .toThrow('Dependency type is required');
    });

    it('should throw InvalidEnumError for invalid dependencyType', () => {
      expect(() => new Dependency({ ...validProps, dependencyType: 'unknown' }))
        .toThrow(InvalidEnumError);
    });

    it('should throw when source equals target (self-dependency)', () => {
      expect(() => new Dependency({
        sourceServiceId: 'same-id',
        targetServiceId: 'same-id',
        dependencyType: 'sync',
      })).toThrow('A service cannot depend on itself');
    });
  });

  describe('recordRequest', () => {
    it('should increment requestCount on success', () => {
      const dep = new Dependency(validProps);
      dep.recordRequest();
      expect(dep.requestCount).toBe(1);
      expect(dep.failureCount).toBe(0);
    });

    it('should increment both counts on failure', () => {
      const dep = new Dependency(validProps);
      dep.recordRequest(true);
      expect(dep.requestCount).toBe(1);
      expect(dep.failureCount).toBe(1);
    });

    it('should update lastSeenAt', () => {
      const dep = new Dependency(validProps);
      const before = dep.lastSeenAt;
      dep.recordRequest();
      expect(dep.lastSeenAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('should track multiple requests accurately', () => {
      const dep = new Dependency(validProps);
      dep.recordRequest(false);
      dep.recordRequest(true);
      dep.recordRequest(false);
      dep.recordRequest(true);
      dep.recordRequest(true);
      expect(dep.requestCount).toBe(5);
      expect(dep.failureCount).toBe(3);
    });
  });

  describe('getFailureRate', () => {
    it('should return 0 when no requests', () => {
      const dep = new Dependency(validProps);
      expect(dep.getFailureRate()).toBe(0);
    });

    it('should calculate correct failure rate', () => {
      const dep = new Dependency({ ...validProps, requestCount: 10, failureCount: 3 });
      expect(dep.getFailureRate()).toBeCloseTo(0.3);
    });

    it('should return 1 when all requests failed', () => {
      const dep = new Dependency({ ...validProps, requestCount: 5, failureCount: 5 });
      expect(dep.getFailureRate()).toBe(1);
    });
  });

  describe('getCompositeKey', () => {
    it('should return composite key string', () => {
      const dep = new Dependency(validProps);
      expect(dep.getCompositeKey()).toBe('source-uuid-111:target-uuid-222:sync');
    });

    it('should produce different keys for different types', () => {
      const sync = new Dependency({ ...validProps, dependencyType: 'sync' });
      const async_ = new Dependency({ ...validProps, dependencyType: 'async' });
      expect(sync.getCompositeKey()).not.toBe(async_.getCompositeKey());
    });
  });

  describe('toJSON', () => {
    it('should include failureRate in serialized output', () => {
      const dep = new Dependency({ ...validProps, requestCount: 10, failureCount: 4 });
      const json = dep.toJSON();
      expect(json.failureRate).toBeCloseTo(0.4);
    });
  });
});
