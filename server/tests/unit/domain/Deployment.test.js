const Deployment = require('../../../src/domain/entities/Deployment');
const { ValidationError } = require('../../../src/domain/errors');

describe('Deployment Entity', () => {
  const validProps = {
    serviceId: 'service-uuid-111',
    previousVersion: '1.7.0',
    newVersion: '1.8.0',
  };

  describe('creation', () => {
    it('should create with required fields', () => {
      const dep = new Deployment(validProps);

      expect(dep.deploymentId).toBeDefined();
      expect(dep.deploymentId.length).toBe(36);
      expect(dep.serviceId).toBe('service-uuid-111');
      expect(dep.previousVersion).toBe('1.7.0');
      expect(dep.newVersion).toBe('1.8.0');
      expect(dep.deployedAt).toBeInstanceOf(Date);
      expect(dep.environment).toBeNull();
      expect(dep.metadata).toEqual({});
    });

    it('should accept all optional fields', () => {
      const deployedAt = new Date('2026-01-15T12:00:00Z');
      const dep = new Deployment({
        ...validProps,
        deployedAt,
        environment: 'production',
        metadata: { deployedBy: 'ci-pipeline' },
      });

      expect(dep.deployedAt).toBe(deployedAt);
      expect(dep.environment).toBe('production');
      expect(dep.metadata).toEqual({ deployedBy: 'ci-pipeline' });
    });

    it('should parse string deployedAt', () => {
      const dep = new Deployment({
        ...validProps,
        deployedAt: '2026-01-15T12:00:00Z',
      });
      expect(dep.deployedAt).toBeInstanceOf(Date);
      expect(dep.deployedAt.toISOString()).toBe('2026-01-15T12:00:00.000Z');
    });
  });

  describe('validation', () => {
    it('should throw when props is null', () => {
      expect(() => new Deployment(null)).toThrow(ValidationError);
    });

    it('should throw when serviceId is missing', () => {
      expect(() => new Deployment({ previousVersion: '1.0', newVersion: '2.0' }))
        .toThrow('Service ID is required');
    });

    it('should allow previousVersion to be null for first deployment', () => {
      const dep = new Deployment({
        serviceId: 'service-uuid-111',
        previousVersion: null,
        newVersion: '1.0.0',
      });
      expect(dep.previousVersion).toBeNull();
      expect(dep.newVersion).toBe('1.0.0');
    });

    it('should default projectId to project-default and accept custom projectId', () => {
      const dep1 = new Deployment(validProps);
      expect(dep1.projectId).toBe('project-default');

      const dep2 = new Deployment({ ...validProps, projectId: 'proj_alpha' });
      expect(dep2.projectId).toBe('proj_alpha');
    });

    it('should throw when projectId is empty string', () => {
      expect(() => new Deployment({ ...validProps, projectId: '   ' })).toThrow(ValidationError);
    });

    it('should throw when newVersion is missing', () => {
      expect(() => new Deployment({ serviceId: 'x', previousVersion: '1.0' }))
        .toThrow('New version is required');
    });

    it('should throw when versions are the same', () => {
      expect(() => new Deployment({
        serviceId: 'x',
        previousVersion: '1.0.0',
        newVersion: '1.0.0',
      })).toThrow('New version must be different from previous version');
    });

    it('should throw on invalid deployedAt', () => {
      expect(() => new Deployment({ ...validProps, deployedAt: 'not-a-date' }))
        .toThrow('Invalid deployedAt timestamp');
    });
  });

  describe('toJSON', () => {
    it('should serialize correctly', () => {
      const dep = new Deployment(validProps);
      const json = dep.toJSON();

      expect(json.deploymentId).toBe(dep.deploymentId);
      expect(json.projectId).toBe('project-default');
      expect(json.serviceId).toBe('service-uuid-111');
      expect(json.previousVersion).toBe('1.7.0');
      expect(json.newVersion).toBe('1.8.0');
      expect(typeof json.deployedAt).toBe('string');
      expect(json.environment).toBeNull();
    });
  });
});
