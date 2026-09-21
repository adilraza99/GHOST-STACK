const mongoose = require('mongoose');
const MongoDeploymentRepository = require('../../../src/infrastructure/repositories/MongoDeploymentRepository');
const Deployment = require('../../../src/domain/entities/Deployment');

describe('MongoDeploymentRepository', () => {
  let repo;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/ghoststack-test');
    repo = new MongoDeploymentRepository();
  });

  beforeEach(async () => {
    await repo.deleteAll();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  describe('save and findById', () => {
    it('should persist and retrieve a deployment', async () => {
      const dep = new Deployment({
        serviceId: 'svc-1',
        previousVersion: '1.0.0',
        newVersion: '1.1.0',
        environment: 'demo',
      });
      await repo.save(dep);

      const found = await repo.findById(dep.deploymentId);
      expect(found).toBeInstanceOf(Deployment);
      expect(found.deploymentId).toBe(dep.deploymentId);
      expect(found.serviceId).toBe('svc-1');
      expect(found.previousVersion).toBe('1.0.0');
      expect(found.newVersion).toBe('1.1.0');
    });

    it('should return null for nonexistent', async () => {
      expect(await repo.findById('nonexistent')).toBeNull();
    });
  });

  describe('findByService', () => {
    it('should return deployments for a service sorted by deployedAt desc', async () => {
      await repo.save(new Deployment({
        serviceId: 'svc-1',
        previousVersion: '1.0',
        newVersion: '1.1',
        deployedAt: new Date('2026-01-10'),
      }));
      await repo.save(new Deployment({
        serviceId: 'svc-1',
        previousVersion: '1.1',
        newVersion: '1.2',
        deployedAt: new Date('2026-01-15'),
      }));
      await repo.save(new Deployment({
        serviceId: 'svc-2',
        previousVersion: '1.0',
        newVersion: '2.0',
      }));

      const results = await repo.findByService('svc-1');
      expect(results).toHaveLength(2);
      expect(results[0].newVersion).toBe('1.2'); // most recent first
    });
  });

  describe('findAll', () => {
    it('should return all deployments', async () => {
      await repo.save(new Deployment({ serviceId: 'a', previousVersion: '1', newVersion: '2' }));
      await repo.save(new Deployment({ serviceId: 'b', previousVersion: '1', newVersion: '2' }));

      const all = await repo.findAll();
      expect(all).toHaveLength(2);
    });
  });

  describe('Project Scoping & Filtering', () => {
    it('should find by project and isolate deployments between projects', async () => {
      await repo.save(new Deployment({
        projectId: 'proj_alpha',
        serviceId: 'payment-service',
        previousVersion: '1.0',
        newVersion: '1.1',
        environment: 'production',
        deployedAt: new Date('2026-03-01T10:00:00Z'),
      }));
      await repo.save(new Deployment({
        projectId: 'proj_beta',
        serviceId: 'payment-service',
        previousVersion: '2.0',
        newVersion: '2.1',
        environment: 'production',
        deployedAt: new Date('2026-03-01T10:00:00Z'),
      }));

      const alphaDeps = await repo.findByProject('proj_alpha');
      const betaDeps = await repo.findByProject('proj_beta');

      expect(alphaDeps).toHaveLength(1);
      expect(alphaDeps[0].newVersion).toBe('1.1');
      expect(betaDeps).toHaveLength(1);
      expect(betaDeps[0].newVersion).toBe('2.1');
    });

    it('should find deployments within a time window (findBetween)', async () => {
      await repo.save(new Deployment({
        projectId: 'proj_alpha',
        serviceId: 'svc-1',
        previousVersion: '1.0',
        newVersion: '1.1',
        deployedAt: new Date('2026-03-01T10:00:00Z'),
      }));
      await repo.save(new Deployment({
        projectId: 'proj_alpha',
        serviceId: 'svc-1',
        previousVersion: '1.1',
        newVersion: '1.2',
        deployedAt: new Date('2026-03-01T10:20:00Z'),
      }));
      await repo.save(new Deployment({
        projectId: 'proj_alpha',
        serviceId: 'svc-1',
        previousVersion: '1.2',
        newVersion: '1.3',
        deployedAt: new Date('2026-03-01T11:00:00Z'),
      }));

      const windowResults = await repo.findBetween(
        'proj_alpha',
        '2026-03-01T10:10:00Z',
        '2026-03-01T10:30:00Z'
      );
      expect(windowResults).toHaveLength(1);
      expect(windowResults[0].newVersion).toBe('1.2');
    });

    it('should find by id with project scope and return null for mismatched project', async () => {
      const dep = await repo.save(new Deployment({
        projectId: 'proj_alpha',
        serviceId: 'svc-1',
        previousVersion: '1.0',
        newVersion: '1.1',
      }));

      const match = await repo.findById('proj_alpha', dep.deploymentId);
      expect(match).not.toBeNull();
      expect(match.deploymentId).toBe(dep.deploymentId);

      const mismatch = await repo.findById('proj_beta', dep.deploymentId);
      expect(mismatch).toBeNull();
    });
  });
});
